// @vitest-environment happy-dom
// Fork-only: opening a commit's whole diff from the full Git Graph (double-click, Enter, header button).
import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'

const mocks = vi.hoisted(() => ({ getRuntimeGitHistory: vi.fn() }))
vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: mocks.getRuntimeGitHistory
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const { GitGraphFullView } = await import('./git-graph-full-view')
const { GitHistoryPanel } = await import('./git-history-panel')
const { resetGitHistoryGraphFiltersForTest } = await import('./git-history-graph-filter')
const { resetGitGraphRememberedSelectionForTest } = await import('./use-git-graph-full-view-state')
const { resetGitGraphBranchTreePreferenceForTest } = await import('./use-git-graph-branch-tree')

const ALPHA: GitHistoryItem = {
  id: 'a'.repeat(40),
  displayId: 'aaaaaaa',
  parentIds: ['b'.repeat(40)],
  subject: 'Alpha',
  message: 'Alpha',
  timestamp: 1
}
const BRAVO: GitHistoryItem = {
  id: 'b'.repeat(40),
  displayId: 'bbbbbbb',
  parentIds: [],
  subject: 'Bravo',
  message: 'Bravo',
  timestamp: 1
}
const RESULT: GitHistoryResult = {
  items: [ALPHA, BRAVO],
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: false,
  limit: 50
}
const FILE: GitBranchChangeEntry = { path: 'src/app.ts', status: 'modified' }

function renderFullView(onOpenCommit: (item: GitHistoryItem) => void): void {
  render(
    <TooltipProvider>
      <GitGraphFullView
        worktreeId="wt-open"
        worktreePath="/repo"
        activeRepoTarget={{ kind: 'local' }}
        state={{ status: 'ready', result: RESULT }}
        onRefresh={vi.fn()}
        onOpenCommit={onOpenCommit}
        onLoadCommitFiles={vi.fn(async () => [FILE])}
        onOpenCommitFile={vi.fn()}
      />
    </TooltipProvider>
  )
}

function row(subject: string): HTMLElement {
  const found = screen
    .getAllByTestId('git-graph-full-row')
    .find((candidate) => candidate.textContent?.includes(subject))
  if (!found) {
    throw new Error(`row ${subject} not rendered`)
  }
  return found
}

afterEach(() => {
  cleanup()
  resetGitHistoryGraphFiltersForTest()
  resetGitGraphRememberedSelectionForTest()
  resetGitGraphBranchTreePreferenceForTest()
  vi.clearAllMocks()
})

describe('full Git Graph: open a commit', () => {
  it('opens the commit on double-click', () => {
    const onOpenCommit = vi.fn()
    renderFullView(onOpenCommit)
    fireEvent.doubleClick(row('Bravo'))
    expect(onOpenCommit).toHaveBeenCalledWith(expect.objectContaining({ id: BRAVO.id }))
  })

  // happy-dom never turns Enter into a button click, so `enter === false` (preventDefault) is the real guard here.
  it('opens the focused commit on Enter and cancels the default that would collapse a multi-selection', async () => {
    const onOpenCommit = vi.fn()
    renderFullView(onOpenCommit)
    fireEvent.click(row('Alpha'))
    fireEvent.click(row('Bravo'), { metaKey: true, ctrlKey: true })
    expect(await screen.findByText('Changed files (1) · 2 commits')).toBeInTheDocument()

    const enter = fireEvent.keyDown(row('Bravo'), { key: 'Enter' })
    expect(enter).toBe(false)
    expect(onOpenCommit).toHaveBeenCalledTimes(1)
    expect(onOpenCommit).toHaveBeenCalledWith(expect.objectContaining({ id: BRAVO.id }))
    expect(screen.getByText('Changed files (1) · 2 commits')).toBeInTheDocument()
  })

  it('leaves modified Enter alone', () => {
    const onOpenCommit = vi.fn()
    renderFullView(onOpenCommit)
    fireEvent.keyDown(row('Alpha'), { key: 'Enter', shiftKey: true })
    expect(onOpenCommit).not.toHaveBeenCalled()
  })

  it('opens from the header button for one commit and disables it for several', async () => {
    const onOpenCommit = vi.fn()
    renderFullView(onOpenCommit)
    fireEvent.click(row('Alpha'))
    const button = await screen.findByRole('button', { name: 'Open all changes' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onOpenCommit).toHaveBeenCalledWith(expect.objectContaining({ id: ALPHA.id }))

    fireEvent.click(row('Bravo'), { metaKey: true, ctrlKey: true })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open all changes' })).toBeDisabled()
    )
  })

  it('drops the bottom "Open all changes together" link', async () => {
    renderFullView(vi.fn())
    fireEvent.click(row('Alpha'))
    expect(await screen.findByText('app.ts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open all changes together' })).toBeNull()
  })
})

describe('sidebar Commits panel', () => {
  it('keeps the bottom "Open all changes together" link', async () => {
    const onOpenCommit = vi.fn()
    render(
      <TooltipProvider>
        <GitHistoryPanel
          state={{ status: 'ready', result: RESULT }}
          collapsed={false}
          onToggle={vi.fn()}
          onRefresh={vi.fn()}
          onOpenCommit={onOpenCommit}
          onLoadCommitFiles={vi.fn(async () => [FILE])}
          onOpenCommitFile={vi.fn()}
        />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Show files in commit aaaaaaa/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open all changes together' }))
    expect(onOpenCommit).toHaveBeenCalledWith(expect.objectContaining({ id: ALPHA.id }))
  })
})
