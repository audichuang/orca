// @vitest-environment happy-dom
// Fork-only: state lifetimes of the full Git Graph (branch list owner, ancestry after a search).
import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'

const mocks = vi.hoisted(() => ({ getRuntimeGitHistory: vi.fn() }))
vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: mocks.getRuntimeGitHistory
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const { GitGraphFullView } = await import('./git-graph-full-view')
const { resetGitHistoryGraphFiltersForTest, updateGitHistoryGraphFilter } =
  await import('./git-history-graph-filter')

const WORKTREE = 'wt-state'
const TIP: GitHistoryItem = {
  id: 'a'.repeat(40),
  parentIds: [],
  subject: 'On main',
  message: 'On main',
  references: [{ id: 'refs/heads/main', name: 'main', category: 'branches' }]
}
const OFF: GitHistoryItem = {
  id: 'c'.repeat(40),
  parentIds: ['d'.repeat(40)],
  subject: 'Elsewhere',
  message: 'Elsewhere'
}

function historyResult(): GitHistoryResult {
  return {
    items: [TIP, OFF],
    currentRef: { id: 'refs/heads/main', name: 'main', revision: TIP.id },
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore: false,
    limit: 50
  }
}

function view(result: GitHistoryResult, target: RuntimeClientTarget): React.JSX.Element {
  return (
    <TooltipProvider>
      <GitGraphFullView
        worktreeId={WORKTREE}
        worktreePath="/repo"
        activeRepoTarget={target}
        state={{ status: 'ready', result }}
        onRefresh={vi.fn()}
        onOpenCommit={vi.fn()}
        onLoadCommitFiles={vi.fn(async () => [])}
        onOpenCommitFile={vi.fn()}
      />
    </TooltipProvider>
  )
}

function offRow(): HTMLElement {
  const row = screen
    .getByText('Elsewhere')
    .closest<HTMLElement>('[data-testid="git-graph-full-row"]')
  if (!row) {
    throw new Error('off-branch row not rendered')
  }
  return row
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
  mocks.getRuntimeGitHistory.mockImplementation(
    async (context: { target: RuntimeClientTarget }) => ({
      ...historyResult(),
      graph: {
        mode: 'head',
        remotes: [],
        limit: 1,
        refs: [
          context.target.kind === 'local'
            ? { fullName: 'refs/heads/local-only', name: 'local-only', category: 'branches' }
            : { fullName: 'refs/heads/env-only', name: 'env-only', category: 'branches' }
        ]
      }
    })
  )
})

afterEach(() => {
  cleanup()
  resetGitHistoryGraphFiltersForTest()
  vi.clearAllMocks()
})

describe('full Git Graph state', () => {
  it('refetches the branch list when the repo owner host changes', async () => {
    const result = historyResult()
    const { rerender } = render(view(result, { kind: 'local' }))
    expect(await screen.findByText('local-only')).toBeInTheDocument()

    rerender(view(result, { kind: 'environment', environmentId: 'env-1' }))
    expect(screen.queryByText('local-only')).not.toBeInTheDocument()
    expect(await screen.findByText('env-only')).toBeInTheDocument()
  })

  it('keeps ancestry unknown for a searched result until fresh history replaces it', async () => {
    const searched = historyResult()
    const { rerender } = render(view(searched, { kind: 'local' }))
    expect(offRow()).toHaveAttribute('data-dimmed', 'true')

    act(() => updateGitHistoryGraphFilter(WORKTREE, { query: 'fix' }))
    await waitFor(() => expect(offRow()).not.toHaveAttribute('data-dimmed'))
    // Query cleared, but the searched list is still what is on screen.
    act(() => updateGitHistoryGraphFilter(WORKTREE, { query: '' }))
    expect(offRow()).not.toHaveAttribute('data-dimmed')

    rerender(view(historyResult(), { kind: 'local' }))
    expect(offRow()).toHaveAttribute('data-dimmed', 'true')
  })
})
