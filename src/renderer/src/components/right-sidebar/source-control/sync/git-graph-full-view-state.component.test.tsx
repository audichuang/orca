// @vitest-environment happy-dom
// Fork-only: state lifetimes of the full Git Graph (branch list owner, ancestry after a search).
import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const { resetGitGraphRememberedSelectionForTest } = await import('./use-git-graph-full-view-state')
const { resetGitGraphBranchTreePreferenceForTest } = await import('./use-git-graph-branch-tree')

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

function view(
  result: GitHistoryResult | undefined,
  target: RuntimeClientTarget
): React.JSX.Element {
  return (
    <TooltipProvider>
      <GitGraphFullView
        worktreeId={WORKTREE}
        worktreePath="/repo"
        activeRepoTarget={target}
        state={result ? { status: 'ready', result } : { status: 'loading' }}
        onRefresh={vi.fn()}
        onOpenCommit={vi.fn()}
        onLoadCommitFiles={vi.fn(async () => [])}
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

function offRow(): HTMLElement {
  return row('Elsewhere')
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
  resetGitGraphRememberedSelectionForTest()
  resetGitGraphBranchTreePreferenceForTest()
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

  it('remembers the selection per host, not per bare worktree id', async () => {
    const local: RuntimeClientTarget = { kind: 'local' }
    const remote: RuntimeClientTarget = { kind: 'environment', environmentId: 'env-1' }
    const first = render(view(historyResult(), local))
    fireEvent.click(row('Elsewhere'))
    first.unmount()

    const onRemote = render(view(historyResult(), remote))
    expect(row('Elsewhere')).not.toHaveAttribute('data-selected')
    fireEvent.click(row('On main'))
    onRemote.unmount()

    render(view(historyResult(), local))
    expect(row('Elsewhere')).toHaveAttribute('data-selected', 'true')
    expect(row('On main')).not.toHaveAttribute('data-selected')
  })

  it('Shift+Arrow after reopening ranges from the restored commit', () => {
    const first = render(view(historyResult(), { kind: 'local' }))
    fireEvent.click(row('On main'))
    first.unmount()

    render(view(historyResult(), { kind: 'local' }))
    fireEvent.keyDown(row('On main'), { key: 'ArrowDown', shiftKey: true })
    expect(row('On main')).toHaveAttribute('data-selected', 'true')
    expect(row('Elsewhere')).toHaveAttribute('data-selected', 'true')
  })

  it('history arriving late does not pull focus out of the search box', () => {
    const { rerender } = render(view(undefined, { kind: 'local' }))
    const search = screen.getByRole('textbox', { name: 'Search commits' })
    act(() => search.focus())
    rerender(view(historyResult(), { kind: 'local' }))
    expect(search).toHaveFocus()
  })

  it('keyboard-picking a branch in the narrow overlay hands focus to its commit', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    render(view(historyResult(), { kind: 'local' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle branches' }))
    const branch = (await screen.findByText('main', { selector: 'nav span' })).closest('button')!
    // Keyboard activation: focus sits on the tree button that the closing overlay removes.
    act(() => branch.focus())
    fireEvent.click(branch)
    expect(screen.queryByRole('navigation', { name: 'Branches and tags' })).not.toBeInTheDocument()
    expect(row('On main')).toHaveFocus()
  })

  it('picking a branch that is not loaded selects its tip once the narrowed history arrives', async () => {
    const { rerender } = render(view(historyResult(), { kind: 'local' }))
    fireEvent.click(await screen.findByText('local-only', { selector: 'nav span' }))

    const LOCAL_ONLY: GitHistoryItem = {
      id: 'e'.repeat(40),
      parentIds: [],
      subject: 'Local only work',
      message: 'Local only work',
      references: [{ id: 'refs/heads/local-only', name: 'local-only', category: 'branches' }]
    }
    rerender(view({ ...historyResult(), items: [TIP, LOCAL_ONLY, OFF] }, { kind: 'local' }))
    await waitFor(() => expect(row('Local only work')).toHaveAttribute('data-selected', 'true'))
    expect(row('Local only work')).toHaveFocus()
  })

  it('drops a pending branch jump once the user navigates elsewhere', async () => {
    const { rerender } = render(view(historyResult(), { kind: 'local' }))
    fireEvent.click(await screen.findByText('local-only', { selector: 'nav span' }))
    fireEvent.click(row('Elsewhere'))

    const LOCAL_ONLY: GitHistoryItem = {
      id: 'e'.repeat(40),
      parentIds: [],
      subject: 'Local only work',
      message: 'Local only work',
      references: [{ id: 'refs/heads/local-only', name: 'local-only', category: 'branches' }]
    }
    rerender(view({ ...historyResult(), items: [TIP, LOCAL_ONLY, OFF] }, { kind: 'local' }))
    expect(row('Elsewhere')).toHaveAttribute('data-selected', 'true')
    expect(row('Local only work')).not.toHaveAttribute('data-selected')
  })

  it('Home and End move focus to the first and last branch-tree item', async () => {
    render(view(historyResult(), { kind: 'local' }))
    const nav = screen.getByRole('navigation', { name: 'Branches and tags' })
    await screen.findByText('local-only', { selector: 'nav span' })
    const items = nav.querySelectorAll<HTMLButtonElement>('[data-tree-key]')
    act(() => items[0]!.focus())
    const last = [...items].at(-1)!
    fireEvent.keyDown(items[0]!, { key: 'End' })
    expect(last).toHaveFocus()
    fireEvent.keyDown(last, { key: 'Home' })
    expect(items[0]).toHaveFocus()
  })
})
