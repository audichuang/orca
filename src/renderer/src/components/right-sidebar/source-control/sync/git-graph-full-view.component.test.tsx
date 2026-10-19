// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { GitHistoryPanelSlots } from './git-history-panel-slots'

const mocks = vi.hoisted(() => ({ getRuntimeGitHistory: vi.fn() }))
vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: mocks.getRuntimeGitHistory
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const { GitGraphFullViewLauncher } = await import('./git-graph-full-view-dialog')
const { GitHistoryGraphToolbar } = await import('./git-history-graph-toolbar')
const { useSourceControlGitHistory } = await import('./use-git-history')
const { resetGitHistoryGraphFiltersForTest } = await import('./git-history-graph-filter')

const WORKTREE = 'wt-1'
const WORKTREES = new Map<string, unknown>([[WORKTREE, {}]])

const TIP: GitHistoryItem = {
  id: 'a'.repeat(40),
  displayId: 'aaaaaaa',
  parentIds: ['b'.repeat(40)],
  subject: 'Alpha',
  message: 'Alpha\n\nLonger body text',
  author: 'Ada',
  timestamp: 1,
  references: [
    { id: 'refs/heads/main', name: 'main', category: 'branches' },
    { id: 'refs/heads/one', name: 'one', category: 'branches' },
    { id: 'refs/heads/two', name: 'two', category: 'branches' },
    { id: 'refs/tags/v1', name: 'v1', category: 'tags' }
  ]
}
const PARENT: GitHistoryItem = {
  id: 'b'.repeat(40),
  displayId: 'bbbbbbb',
  parentIds: [],
  subject: 'Bravo',
  message: 'Bravo',
  timestamp: 1
}
const RESULT: GitHistoryResult = {
  items: [TIP, PARENT],
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: false,
  limit: 50
}
const FILE: GitBranchChangeEntry = { path: 'src/app.ts', status: 'modified' }

function Harness({
  onOpenCommitFile,
  onLoadCommitFiles,
  renderCommitFilesMenu
}: {
  onOpenCommitFile: () => void
  onLoadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  renderCommitFilesMenu?: GitHistoryPanelSlots['renderCommitFilesMenu']
}): React.JSX.Element {
  const { gitHistoryState, refreshGitHistory } = useSourceControlGitHistory({
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
      <GitHistoryGraphToolbar
        worktreeId={WORKTREE}
        worktreePath="/repo"
        activeRepoTarget={{ kind: 'local' }}
        state={gitHistoryState}
        trailing={
          <GitGraphFullViewLauncher
            worktreeId={WORKTREE}
            worktreePath="/repo"
            activeRepoTarget={{ kind: 'local' }}
            state={gitHistoryState}
            onRefresh={() => void refreshGitHistory()}
            onOpenCommit={vi.fn()}
            onLoadCommitFiles={onLoadCommitFiles}
            onOpenCommitFile={onOpenCommitFile}
            renderCommitFilesMenu={renderCommitFilesMenu}
          />
        }
      />
    </TooltipProvider>
  )
}

beforeEach(() => {
  // A fresh object per read, like the real RPC, so a refresh replaces the result.
  mocks.getRuntimeGitHistory.mockImplementation(async () => ({ ...RESULT }))
})

afterEach(() => {
  cleanup()
  resetGitHistoryGraphFiltersForTest()
  vi.clearAllMocks()
})

describe('full-width Git Graph', () => {
  it('shows every ref, loads a selected commit, and closes before opening a file diff', async () => {
    const onOpenCommitFile = vi.fn()
    const onLoadCommitFiles = vi.fn(async () => [FILE])
    render(<Harness onOpenCommitFile={onOpenCommitFile} onLoadCommitFiles={onLoadCommitFiles} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const dialog = await screen.findByRole('dialog')
    const rows = await within(dialog).findAllByTestId('git-graph-full-row')
    expect(rows).toHaveLength(2)
    // The sidebar row caps refs at two; the full view shows all of them.
    for (const name of ['main', 'one', 'two', 'v1']) {
      expect(within(rows[0]!).getByText(name)).toBeInTheDocument()
    }

    fireEvent.click(rows[0]!)
    expect(onLoadCommitFiles).toHaveBeenCalledWith(TIP)
    expect(await within(dialog).findByText('Longer body text')).toBeInTheDocument()
    fireEvent.click(await within(dialog).findByTestId('git-history-commit-file'))

    expect(onOpenCommitFile).toHaveBeenCalledWith(TIP, FILE, expect.anything())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('hands the selected commit files to the fork menu with a dialog-closing open', async () => {
    const onOpenCommitFile = vi.fn()
    const renderCommitFilesMenu = vi.fn<NonNullable<GitHistoryPanelSlots['renderCommitFilesMenu']>>(
      (_item, _entries, _open, list) => list
    )
    render(
      <Harness
        onOpenCommitFile={onOpenCommitFile}
        onLoadCommitFiles={vi.fn(async () => [FILE])}
        renderCommitFilesMenu={renderCommitFilesMenu}
      />
    )
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click((await within(dialog).findAllByTestId('git-graph-full-row'))[0]!)
    await within(dialog).findByTestId('git-history-commit-file')

    const [item, entries, openFile] = renderCommitFilesMenu.mock.lastCall!
    expect(item).toBe(TIP)
    expect(entries).toEqual([FILE])
    act(() => openFile(FILE, { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }))
    expect(onOpenCommitFile).toHaveBeenCalledWith(TIP, FILE, expect.anything())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('reloads the selected commit files after a refresh replaces the result', async () => {
    const onLoadCommitFiles = vi.fn(async () => [FILE])
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={onLoadCommitFiles} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click((await within(dialog).findAllByTestId('git-graph-full-row'))[0]!)
    await within(dialog).findByTestId('git-history-commit-file')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh commits' }))
    await waitFor(() => expect(onLoadCommitFiles).toHaveBeenCalledTimes(2))
    expect(await within(dialog).findByTestId('git-history-commit-file')).toBeInTheDocument()
  })

  it('keeps a query typed in the dialog when an older sidebar draft is still debouncing', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox', { name: 'Search commits' }), {
      target: { value: 'fi' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search commits' }), {
      target: { value: 'fix' }
    })

    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(within(dialog).getByRole('textbox', { name: 'Search commits' })).toHaveValue('fix')
    expect(mocks.getRuntimeGitHistory.mock.calls.at(-1)?.[1]).toMatchObject({
      graph: { search: { text: 'fix' } }
    })
    expect(mocks.getRuntimeGitHistory).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ graph: expect.objectContaining({ search: { text: 'fi' } }) })
    )
  })

  it('keeps the sidebar search in step with a query typed in the full view', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search commits' }), {
      target: { value: 'fix' }
    })
    await waitFor(() =>
      expect(mocks.getRuntimeGitHistory.mock.calls.at(-1)?.[1]).toMatchObject({
        graph: { search: { text: 'fix' } }
      })
    )
    const searchBoxes = screen.getAllByRole('textbox', { name: 'Search commits', hidden: true })
    for (const box of searchBoxes) {
      expect(box).toHaveValue('fix')
    }
    // Without the sync the sidebar's stale empty draft would be debounced back over 'fix'.
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(mocks.getRuntimeGitHistory.mock.calls.at(-1)?.[1]).toMatchObject({
      graph: { search: { text: 'fix' } }
    })
  })
})
