// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitHistoryGraphApplied } from '../../../../../../shared/git-history-graph-query-types'

const mocks = vi.hoisted(() => ({ getRuntimeGitHistory: vi.fn() }))
vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: mocks.getRuntimeGitHistory
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const { GitHistoryPanel } = await import('./git-history-panel')
const { GitHistoryGraphLoadMore, GitHistoryGraphToolbar } =
  await import('./git-history-graph-toolbar')
const { GitHistoryGraphEmptyMessage } = await import('./git-history-graph-empty-message')
const { useSourceControlGitHistory } = await import('./use-git-history')
const { resetGitHistoryGraphFiltersForTest, updateGitHistoryGraphFilter } =
  await import('./git-history-graph-filter')

const WORKTREE = 'wt-1'
const WORKTREES = new Map<string, unknown>([[WORKTREE, {}]])

function commit(id: string, subject: string): GitHistoryItem {
  return { id: id.padEnd(40, '0'), parentIds: [], subject, message: subject, timestamp: 1 }
}

const COMMITS = [commit('a', 'Alpha'), commit('b', 'Bravo'), commit('c', 'Charlie')]

const APPLIED: GitHistoryGraphApplied = {
  mode: 'all',
  refs: [
    { fullName: 'refs/heads/main', name: 'main', category: 'branches' },
    { fullName: 'refs/heads/feature/x', name: 'feature/x', category: 'branches' },
    {
      fullName: 'refs/remotes/origin/main',
      name: 'origin/main',
      category: 'remote branches',
      remote: 'origin'
    }
  ],
  refsTruncated: false,
  remotes: ['origin'],
  limit: 50
}

function result(extra: Partial<GitHistoryResult> = {}): GitHistoryResult {
  return {
    items: COMMITS,
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore: false,
    limit: 50,
    ...extra
  }
}

/** The real hook feeding the real panel + toolbar, so filter clicks travel all the way to the request. */
function Harness({
  onCommitAction
}: {
  onCommitAction?: Parameters<typeof GitHistoryPanel>[0]['onCommitAction']
}): React.JSX.Element {
  const { gitHistoryState } = useSourceControlGitHistory({
    activeRepoTarget: { kind: 'local' },
    activeWorktreeId: WORKTREE,
    worktreePath: '/repo',
    compareBaseRef: null,
    isFolder: false,
    isBranchVisible: true,
    isGitHistoryExpanded: true,
    isGitHistoryVisible: true,
    worktreeMap: WORKTREES
  })
  return (
    <TooltipProvider>
      <GitHistoryPanel
        state={gitHistoryState}
        collapsed={false}
        onToggle={vi.fn()}
        onRefresh={vi.fn()}
        onCommitAction={onCommitAction}
        toolbar={
          <GitHistoryGraphToolbar
            worktreeId={WORKTREE}
            worktreePath="/repo"
            activeRepoTarget={{ kind: 'local' }}
            result={gitHistoryState.result}
          />
        }
        footer={<GitHistoryGraphLoadMore worktreeId={WORKTREE} result={gitHistoryState.result} />}
        emptyMessage={<GitHistoryGraphEmptyMessage worktreeId={WORKTREE} />}
      />
    </TooltipProvider>
  )
}

const lastRequest = (): Record<string, unknown> =>
  mocks.getRuntimeGitHistory.mock.calls.at(-1)?.[1] ?? {}

beforeEach(() => {
  mocks.getRuntimeGitHistory.mockImplementation(async (_context, options) =>
    options.graph ? result({ graph: { ...APPLIED, mode: options.graph.mode } }) : result()
  )
})

afterEach(() => {
  cleanup()
  resetGitHistoryGraphFiltersForTest()
  vi.clearAllMocks()
})

describe('Commits graph filter, end to end through the history hook', () => {
  it('sends no graph request until the user changes the filter', async () => {
    render(<Harness />)
    await screen.findByText('Alpha')
    expect(lastRequest()).not.toHaveProperty('graph')
    expect(screen.getByRole('combobox', { name: 'Branch filter' })).toHaveTextContent(
      'Current branch'
    )
  })

  it('switches to all branches, then narrows to two picked branches', async () => {
    render(<Harness />)
    await screen.findByText('Alpha')

    fireEvent.click(screen.getByRole('combobox', { name: 'Branch filter' }))
    fireEvent.click(await screen.findByText('All branches', { selector: '[cmdk-item]' }))
    await waitFor(() =>
      expect(lastRequest()).toMatchObject({
        graph: { mode: 'all', source: { local: true, remotes: [] } }
      })
    )

    fireEvent.click(await screen.findByText('origin', { selector: '[cmdk-item] *' }))
    await waitFor(() =>
      expect(lastRequest()).toMatchObject({ graph: { source: { remotes: ['origin'] } } })
    )

    fireEvent.click(screen.getByText('feature/x'))
    fireEvent.click(screen.getByText('origin/main'))
    await waitFor(() =>
      expect(lastRequest()).toMatchObject({
        graph: { mode: 'refs', refs: ['refs/heads/feature/x', 'refs/remotes/origin/main'] }
      })
    )
    expect(screen.getByRole('combobox', { name: 'Branch filter' })).toHaveTextContent('2 branches')
  })

  it('debounces search text into a git-side search with author and path', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(<Harness />)
      await screen.findByText('Alpha')
      fireEvent.change(screen.getByRole('textbox', { name: 'Search commits' }), {
        target: { value: 'fix author:ann path:src/a.ts' }
      })
      await act(async () => {
        vi.advanceTimersByTime(400)
      })
      await waitFor(() =>
        expect(lastRequest()).toMatchObject({
          graph: { mode: 'head', search: { text: 'fix', author: 'ann', path: 'src/a.ts' } }
        })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('tells the user when the repo host is too old to apply the filter', async () => {
    mocks.getRuntimeGitHistory.mockImplementation(async () => result())
    updateGitHistoryGraphFilter(WORKTREE, { scope: 'all' })
    render(<Harness />)
    await screen.findByText('Alpha')
    expect(
      await screen.findByText(
        'This repository host runs an older Orca that only shows the current branch.'
      )
    ).toBeInTheDocument()
  })

  it('loads more by growing the page, keeping one continuous list', async () => {
    mocks.getRuntimeGitHistory.mockImplementation(async (_context, options) =>
      result({ hasMore: true, ...(options.graph ? { graph: APPLIED } : {}) })
    )
    render(<Harness />)
    fireEvent.click(await screen.findByText('Load more commits'))
    await waitFor(() =>
      expect(lastRequest()).toMatchObject({ graph: { mode: 'head', limit: 103 } })
    )
  })

  it('re-reads the branch list each time the picker opens, so new branches appear', async () => {
    let refs = APPLIED.refs
    mocks.getRuntimeGitHistory.mockImplementation(async (_context, options) =>
      options.graph ? result({ graph: { ...APPLIED, refs, mode: options.graph.mode } }) : result()
    )
    render(<Harness />)
    await screen.findByText('Alpha')
    const picker = screen.getByRole('combobox', { name: 'Branch filter' })

    fireEvent.click(picker)
    await screen.findByText('feature/x')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('feature/x')).not.toBeInTheDocument())

    refs = [...APPLIED.refs, { fullName: 'refs/heads/new', name: 'new', category: 'branches' }]
    fireEvent.click(picker)
    expect(await screen.findByText('new')).toBeInTheDocument()
  })

  it('says no commits match when a search finds nothing, not that the repo is empty', async () => {
    mocks.getRuntimeGitHistory.mockImplementation(async (_context, options) =>
      options.graph ? result({ items: [], graph: { ...APPLIED, mode: 'head' } }) : result()
    )
    updateGitHistoryGraphFilter(WORKTREE, { query: 'nothing-matches' })
    render(<Harness />)
    expect(await screen.findByText('No commits match this filter')).toBeInTheDocument()
    expect(screen.queryByText('No commits yet')).not.toBeInTheDocument()
  })

  it('copies the Ctrl/Cmd-selected commits from the context menu', async () => {
    const onCommitAction = vi.fn()
    render(<Harness onCommitAction={onCommitAction} />)
    const alpha = await screen.findByText('Alpha')
    const modifier = navigator.userAgent.includes('Mac') ? { metaKey: true } : { ctrlKey: true }
    fireEvent.click(alpha, modifier)
    fireEvent.click(screen.getByText('Charlie'), modifier)

    fireEvent.contextMenu(screen.getByText('Charlie'))
    const items = await screen.findAllByRole('menuitem')
    const copyItem = items.find((item) => item.textContent === 'Copy Full Source (2 commits)')
    expect(copyItem).toBeDefined()
    fireEvent.click(copyItem!)

    const [action, target, selected] = onCommitAction.mock.calls[0] ?? []
    expect(action).toBe('copy-full-source')
    expect(target?.id).toBe(COMMITS[2].id)
    expect(selected?.map((item: GitHistoryItem) => item.id)).toEqual([COMMITS[0].id, COMMITS[2].id])
  })
})
