// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { GitHistoryPanelSlots } from './git-history-panel-slots'
import type { GitHistoryCommitActionHandler } from './use-git-history-commit-selection'

const mocks = vi.hoisted(() => ({ getRuntimeGitHistory: vi.fn() }))
vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: mocks.getRuntimeGitHistory
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const { GitGraphFullView } = await import('./git-graph-full-view')
const { GitHistoryGraphToolbar } = await import('./git-history-graph-toolbar')
const { useSourceControlGitHistory } = await import('./use-git-history')
const { resetGitHistoryGraphFiltersForTest } = await import('./git-history-graph-filter')
const { resetGitGraphRememberedSelectionForTest } = await import('./use-git-graph-full-view-state')
const { resetGitGraphBranchTreePreferenceForTest } = await import('./use-git-graph-branch-tree')

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
  renderCommitFilesMenu,
  onCommitAction
}: {
  onCommitAction?: GitHistoryCommitActionHandler
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
  const [open, setOpen] = useState(false)
  // The sidebar toolbar stays mounted next to the full view, as with the editor tab.
  return (
    <TooltipProvider>
      <GitHistoryGraphToolbar
        worktreeId={WORKTREE}
        worktreePath="/repo"
        activeRepoTarget={{ kind: 'local' }}
        state={gitHistoryState}
        trailing={
          <button type="button" onClick={() => setOpen((prev) => !prev)}>
            Open Git Graph
          </button>
        }
      />
      {open && (
        <section aria-label="Git Graph">
          <GitGraphFullView
            worktreeId={WORKTREE}
            worktreePath="/repo"
            activeRepoTarget={{ kind: 'local' }}
            state={gitHistoryState}
            onRefresh={() => void refreshGitHistory()}
            onOpenCommit={vi.fn()}
            onLoadCommitFiles={onLoadCommitFiles}
            onOpenCommitFile={onOpenCommitFile}
            renderCommitFilesMenu={renderCommitFilesMenu}
            onCommitAction={onCommitAction}
          />
        </section>
      )}
    </TooltipProvider>
  )
}

beforeEach(() => {
  // A fresh object per read, like the real RPC, so a refresh replaces the result.
  mocks.getRuntimeGitHistory.mockImplementation(async () => ({ ...RESULT }))
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  resetGitHistoryGraphFiltersForTest()
  resetGitGraphRememberedSelectionForTest()
  resetGitGraphBranchTreePreferenceForTest()
  vi.clearAllMocks()
})

describe('full-width Git Graph', () => {
  it('centers the commit a jump lands on', async () => {
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll
    })
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    fireEvent.click((await within(view).findAllByTestId('git-graph-full-row'))[0]!)
    scroll.mockClear()

    fireEvent.click(await within(view).findByRole('button', { name: 'bbbbbbb' }))
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
  })

  it('shows every ref, loads a selected commit, and opens a file diff', async () => {
    const onOpenCommitFile = vi.fn()
    const onLoadCommitFiles = vi.fn(async () => [FILE])
    render(<Harness onOpenCommitFile={onOpenCommitFile} onLoadCommitFiles={onLoadCommitFiles} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    const rows = await within(view).findAllByTestId('git-graph-full-row')
    expect(rows).toHaveLength(2)
    // One readable badge plus "+N"; the rest are named in its tooltip and in the details pane.
    expect(within(rows[0]!).getByText('main')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('+3')).toHaveAttribute('title', 'one\ntwo\nv1')

    fireEvent.click(rows[0]!)
    expect(onLoadCommitFiles).toHaveBeenCalledWith(TIP)
    expect(await within(view).findByText('Longer body text')).toBeInTheDocument()
    fireEvent.click(await within(view).findByTestId('git-history-commit-file'))

    expect(onOpenCommitFile).toHaveBeenCalledWith(TIP, FILE, expect.anything())
  })

  it('hands the selected commit files to the fork menu', async () => {
    const onOpenCommitFile = vi.fn()
    const renderCommitFilesMenu = vi.fn<NonNullable<GitHistoryPanelSlots['renderCommitFilesMenu']>>(
      (_items, _entries, _open, renderList) => renderList(new Set())
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
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    fireEvent.click((await within(view).findAllByTestId('git-graph-full-row'))[0]!)
    await within(view).findByTestId('git-history-commit-file')

    const [items, entries, openFile] = renderCommitFilesMenu.mock.lastCall!
    expect(items).toEqual([TIP])
    expect(entries).toEqual([FILE])
    act(() => openFile(FILE, { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }))
    expect(onOpenCommitFile).toHaveBeenCalledWith(TIP, FILE, expect.anything())
  })

  it('Cmd/Ctrl-click merges the files of both commits; each file opens at its newest commit', async () => {
    const onOpenCommitFile = vi.fn()
    const OTHER: GitBranchChangeEntry = { path: 'src/other.ts', status: 'added' }
    const filesOf: Record<string, GitBranchChangeEntry[]> = {
      [TIP.id]: [FILE],
      [PARENT.id]: [{ ...FILE, status: 'added' }, OTHER]
    }
    render(
      <Harness
        onOpenCommitFile={onOpenCommitFile}
        onLoadCommitFiles={vi.fn(async (item: GitHistoryItem) => filesOf[item.id] ?? [])}
      />
    )
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    const rows = await within(view).findAllByTestId('git-graph-full-row')
    fireEvent.click(rows[0]!)
    // Both modifiers so the test holds on every platform's Cmd-or-Ctrl key.
    fireEvent.click(rows[1]!, { metaKey: true, ctrlKey: true })

    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
    expect(await within(view).findByText('Changed files (2) · 2 commits')).toBeInTheDocument()
    const files = within(view).getAllByTestId('git-history-commit-file')
    expect(files.map((row) => row.getAttribute('data-commit-file-path'))).toEqual([
      'src/app.ts',
      'src/other.ts'
    ])
    fireEvent.click(files[0]!)
    expect(onOpenCommitFile).toHaveBeenCalledWith(TIP, FILE, expect.anything())
  })

  it('emptying a Cmd/Ctrl selection shows nothing instead of an older plain click', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    const rows = await within(view).findAllByTestId('git-graph-full-row')
    const toggle = { metaKey: true, ctrlKey: true }
    fireEvent.click(rows[0]!)
    fireEvent.click(rows[1]!, toggle)
    fireEvent.click(rows[0]!, toggle)
    fireEvent.click(rows[1]!, toggle)

    expect(rows[0]).not.toHaveAttribute('data-selected')
    expect(rows[1]).not.toHaveAttribute('data-selected')
    expect(
      await within(view).findByText('Select a commit to see its details and changed files.')
    ).toBeInTheDocument()
  })

  it('remounting the view lands on the same commit', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    let view = await screen.findByRole('region', { name: 'Git Graph' })
    fireEvent.click((await within(view).findAllByTestId('git-graph-full-row'))[1]!)
    await within(view).findByTestId('git-history-commit-file')
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    expect(screen.queryByRole('region', { name: 'Git Graph' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    view = await screen.findByRole('region', { name: 'Git Graph' })
    const rows = await within(view).findAllByTestId('git-graph-full-row')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
    expect(await within(view).findByText('Bravo', { selector: 'p' })).toBeInTheDocument()
  })

  it('remounting the view keeps a multi-commit selection', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    let view = await screen.findByRole('region', { name: 'Git Graph' })
    let rows = await within(view).findAllByTestId('git-graph-full-row')
    fireEvent.click(rows[0]!)
    fireEvent.click(rows[1]!, { metaKey: true, ctrlKey: true })
    expect(await within(view).findByText('Changed files (1) · 2 commits')).toBeInTheDocument()
    // Opening a diff makes the tab inactive, which unmounts the view.
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    expect(screen.queryByRole('region', { name: 'Git Graph' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    view = await screen.findByRole('region', { name: 'Git Graph' })
    rows = await within(view).findAllByTestId('git-graph-full-row')
    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
    expect(await within(view).findByText('Changed files (1) · 2 commits')).toBeInTheDocument()
    // The range anchor survives too: Shift-click ranges from the last Cmd/Ctrl-clicked commit.
    fireEvent.click(rows[0]!, { shiftKey: true })
    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
  })

  it('a selection the user emptied stays empty after a remount', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    let view = await screen.findByRole('region', { name: 'Git Graph' })
    let rows = await within(view).findAllByTestId('git-graph-full-row')
    fireEvent.click(rows[0]!)
    fireEvent.click(rows[1]!, { metaKey: true, ctrlKey: true })
    fireEvent.click(rows[0]!, { metaKey: true, ctrlKey: true })
    fireEvent.click(rows[1]!, { metaKey: true, ctrlKey: true })
    expect(rows[0]).not.toHaveAttribute('data-selected', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    expect(screen.queryByRole('region', { name: 'Git Graph' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    view = await screen.findByRole('region', { name: 'Git Graph' })
    rows = await within(view).findAllByTestId('git-graph-full-row')
    for (const row of rows) {
      expect(row).not.toHaveAttribute('data-selected', 'true')
    }
  })

  it('right-clicking a row inside the selection offers the commit menu for all selected', async () => {
    const onCommitAction = vi.fn()
    render(
      <Harness
        onOpenCommitFile={vi.fn()}
        onLoadCommitFiles={vi.fn(async () => [FILE])}
        onCommitAction={onCommitAction}
      />
    )
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    const rows = await within(view).findAllByTestId('git-graph-full-row')
    fireEvent.click(rows[0]!)
    fireEvent.click(rows[1]!, { metaKey: true, ctrlKey: true })
    fireEvent.contextMenu(rows[1]!)
    const item = await screen.findByRole('menuitem', { name: 'Copy Full Source (2 commits)' })
    expect(screen.getByRole('menuitem', { name: 'Copy commit hashes (2 commits)' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Copy commit messages (2 commits)' })).toBeTruthy()
    // Menu keys bubble to the list through React's tree; they must not move the selection.
    for (const key of ['ArrowDown', 'End', 'Home']) {
      fireEvent.keyDown(item, { key })
    }
    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
    fireEvent.click(item)
    const [action, target, selected] = onCommitAction.mock.calls[0] ?? []
    expect(action).toBe('copy-full-source')
    expect(target?.id).toBe(PARENT.id)
    expect(selected?.map((item: GitHistoryItem) => item.id)).toEqual([TIP.id, PARENT.id])
  })

  it('header and rows show the same columns at a narrow list width', async () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 500, 24))
    try {
      render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
      await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
      fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
      const view = await screen.findByRole('region', { name: 'Git Graph' })
      const rows = await within(view).findAllByTestId('git-graph-full-row')
      const colsOf = (el: Element): string[] =>
        Array.from(el.querySelectorAll(':scope > [data-col]')).map(
          (cell) => cell.getAttribute('data-col') ?? ''
        )
      const header = view.querySelector<HTMLElement>('[data-git-graph-header]')!
      expect(colsOf(header)).toEqual(['graph', 'message', 'date'])
      for (const row of rows) {
        expect(colsOf(row)).toEqual(colsOf(header))
        expect(row.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns)
      }
    } finally {
      rect.mockRestore()
    }
  })

  it('focuses the commit list on open; arrows move the selection and Shift+Arrow extends it', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    const rows = await within(view).findAllByTestId('git-graph-full-row')
    await waitFor(() => expect(rows[0]).toHaveFocus())
    expect(rows[0]).toHaveAttribute('tabindex', '0')
    expect(rows[1]).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' })
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveFocus()
    fireEvent.keyDown(rows[1]!, { key: 'ArrowUp', shiftKey: true })
    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
  })

  it('Escape with the narrow branch overlay open closes the overlay', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    await within(view).findAllByTestId('git-graph-full-row')
    const toggle = within(view).getByRole('button', { name: 'Toggle branches' })
    fireEvent.click(toggle)
    expect(within(view).getByRole('navigation', { name: 'Branches and tags' })).toBeVisible()

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Git Graph' })).toBeInTheDocument()
    expect(within(view).queryByRole('navigation', { name: 'Branches and tags' })).toBeNull()
    expect(toggle).toHaveFocus()
  })

  it('Escape over an open popover closes only the popover, even with the branch overlay open', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    await within(view).findAllByTestId('git-graph-full-row')
    fireEvent.click(within(view).getByRole('button', { name: 'Toggle branches' }))
    fireEvent.click(within(view).getByRole('combobox', { name: 'Branch filter' }))
    await waitFor(() => expect(document.querySelector('[cmdk-item]')).not.toBeNull())

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('[cmdk-item]')).toBeNull())
    expect(screen.getByRole('region', { name: 'Git Graph' })).toBeInTheDocument()
    expect(within(view).getByRole('navigation', { name: 'Branches and tags' })).toBeVisible()
  })

  it('keeps the branch tree closed after the user closed it, across reopening', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [FILE])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    let view = await screen.findByRole('region', { name: 'Git Graph' })
    expect(within(view).getByRole('navigation', { name: 'Branches and tags' })).toBeVisible()
    fireEvent.click(within(view).getByRole('button', { name: 'Toggle branches' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    expect(screen.queryByRole('region', { name: 'Git Graph' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    view = await screen.findByRole('region', { name: 'Git Graph' })
    expect(within(view).queryByRole('navigation', { name: 'Branches and tags' })).toBeNull()
  })

  it('reloads the selected commit files after a refresh replaces the result', async () => {
    const onLoadCommitFiles = vi.fn(async () => [FILE])
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={onLoadCommitFiles} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    fireEvent.click((await within(view).findAllByTestId('git-graph-full-row'))[0]!)
    await within(view).findByTestId('git-history-commit-file')

    fireEvent.click(within(view).getByRole('button', { name: 'Refresh commits' }))
    await waitFor(() => expect(onLoadCommitFiles).toHaveBeenCalledTimes(2))
    expect(await within(view).findByTestId('git-history-commit-file')).toBeInTheDocument()
  })

  it('keeps a query typed in the full view when an older sidebar draft is still debouncing', async () => {
    render(<Harness onOpenCommitFile={vi.fn()} onLoadCommitFiles={vi.fn(async () => [])} />)
    await waitFor(() => expect(mocks.getRuntimeGitHistory).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('textbox', { name: 'Search commits' }), {
      target: { value: 'fi' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    fireEvent.change(within(view).getByRole('textbox', { name: 'Search commits' }), {
      target: { value: 'fix' }
    })

    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(within(view).getByRole('textbox', { name: 'Search commits' })).toHaveValue('fix')
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
    const view = await screen.findByRole('region', { name: 'Git Graph' })

    fireEvent.change(within(view).getByRole('textbox', { name: 'Search commits' }), {
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
