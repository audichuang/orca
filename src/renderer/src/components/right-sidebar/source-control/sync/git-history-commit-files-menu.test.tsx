// @vitest-environment happy-dom
// Fork seam guard: upstream's Commits panel must keep handing expanded files to the fork's menu.
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'

type MenuProps = {
  relativePath?: string
  absolutePath?: string
  onView?: () => void
  viewItems?: React.ReactNode
  copyItems?: React.ReactNode
  onRevealInExplorer: (worktreeId: string, absolutePath: string) => void
  children: React.ReactNode
}
const mocks = vi.hoisted((): { menuProps: MenuProps | null; copy: ReturnType<typeof vi.fn> } => ({
  menuProps: null,
  copy: vi.fn()
}))
vi.mock('../listing/entry-context-menu', () => ({
  SourceControlEntryContextMenu: (props: MenuProps) => {
    mocks.menuProps = props
    return props.children
  }
}))
vi.mock('./git-history-commit-copy', () => ({ copyHistoryCommitsFullSource: mocks.copy }))

const { OpenToSideMenuItem, ShowFileHistoryMenuItem } =
  await import('../listing/entry-context-menu-slots')
const { ClipcodeCopyFullSourceMenuItem } = await import('../clipcode/clipcode-menu-items')
const { GitHistoryCommitFilesMenu, commitFilesMenuSlot } =
  await import('./git-history-commit-files-menu')
const { GitHistoryPanel } = await import('./git-history-panel')
const { getGitHistoryGraphFilter, gitGraphTabFilterKey, resetGitHistoryGraphFiltersForTest } =
  await import('./git-history-graph-filter')
const { buildGitGraphTabId } = await import('../../../git-graph-tab/git-graph-tab-model')

const item: GitHistoryItem = {
  id: 'a'.repeat(40),
  displayId: 'aaaaaaa',
  parentIds: [],
  subject: 'Alpha',
  message: 'Alpha'
}
const entries: GitBranchChangeEntry[] = [
  { path: 'src/one.ts', status: 'modified' },
  { path: 'src/two.ts', status: 'added' },
  { path: 'src/three.ts', status: 'deleted' }
]

const defaultModel = {
  activeConnectionId: null,
  activeRepoTarget: { kind: 'local' as const },
  editorWorktreeId: 'folder-1',
  revealInExplorer: vi.fn()
}

function renderMenu(model = defaultModel, onOpenFile = vi.fn()): void {
  render(
    <GitHistoryCommitFilesMenu
      {...{ model, entries, onOpenFile }}
      items={[item]}
      loadCommitFiles={async () => entries}
      worktreeId="repo-wt"
      worktreePath="/repo"
      renderList={(selectedPaths) => (
        <div>
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              data-commit-file-path={entry.path}
              data-selected={selectedPaths.has(entry.path) || undefined}
              onClick={() => onOpenFile(entry)}
            >
              <span>{entry.path}</span>
            </button>
          ))}
          <div data-commit-dir-path="src">
            <span>src folder</span>
          </div>
          <span>Open all</span>
        </div>
      )}
    />
  )
}

/** The props of the fork item of `type` inside a menu slot, if the slot renders one. */
function slotItem(slot: React.ReactNode, type: unknown): Record<string, unknown> | undefined {
  let found: Record<string, unknown> | undefined
  const walk = (node: React.ReactNode): void => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement<Record<string, unknown> & { children?: React.ReactNode }>(child)) {
        return
      }
      if (child.type === type) {
        found = child.props
      }
      walk(child.props.children)
    })
  }
  walk(slot)
  return found
}
function action(props: Record<string, unknown> | undefined, name: string): () => void {
  const fn = props?.[name]
  expect(fn).toBeTypeOf('function')
  return () => {
    if (typeof fn === 'function') {
      fn()
    }
  }
}
const copyFullSourceItem = () =>
  slotItem(mocks.menuProps?.copyItems, ClipcodeCopyFullSourceMenuItem)
const showFileHistoryItem = () => slotItem(mocks.menuProps?.viewItems, ShowFileHistoryMenuItem)
const openToSideItem = () => slotItem(mocks.menuProps?.viewItems, OpenToSideMenuItem)
const copyFullSource = (): void => action(copyFullSourceItem(), 'onSelect')()
const showFileHistory = (): void => action(showFileHistoryItem(), 'onSelect')()

afterEach(() => {
  cleanup()
  mocks.menuProps = null
  vi.clearAllMocks()
  resetGitHistoryGraphFiltersForTest()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('GitHistoryCommitFilesMenu', () => {
  it('targets the right-clicked file and copies only that file at the commit', async () => {
    const onOpenFile = vi.fn()
    const model = {
      activeConnectionId: null,
      activeRepoTarget: { kind: 'local' as const },
      editorWorktreeId: 'folder-1',
      revealInExplorer: vi.fn()
    }
    renderMenu(model, onOpenFile)

    // A prevented contextmenu is what keeps Radix from opening an all-disabled menu.
    expect(fireEvent.contextMenu(screen.getByText('Open all'))).toBe(false)
    fireEvent.contextMenu(screen.getByText('src/two.ts'))

    expect(mocks.menuProps?.relativePath).toBe('src/two.ts')
    expect(mocks.menuProps?.absolutePath).toBe('/repo/src/two.ts')
    mocks.menuProps?.onView?.()
    expect(onOpenFile).toHaveBeenCalledWith(entries[1], expect.objectContaining({ altKey: false }))
    const openToSide = openToSideItem()?.onOpen
    expect(openToSide).toBeTypeOf('function')
    if (typeof openToSide === 'function') {
      openToSide({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })
    }
    expect(onOpenFile).toHaveBeenLastCalledWith(
      entries[1],
      expect.objectContaining({ altKey: true })
    )
    mocks.menuProps?.onRevealInExplorer('repo-wt', '/repo/src/two.ts')
    expect(model.revealInExplorer).toHaveBeenCalledWith('folder-1', '/repo/src/two.ts')
    copyFullSource()
    const args = mocks.copy.mock.calls[0]?.[0]
    expect(args).toMatchObject({
      items: [item],
      worktreeId: 'repo-wt',
      editorWorktreeId: 'folder-1'
    })
    await expect(args.loadCommitFiles(item)).resolves.toEqual([entries[1]])
  })

  it('targets a right-clicked folder: copies its path and the full source of its files', async () => {
    renderMenu()
    fireEvent.contextMenu(screen.getByText('src folder'))

    expect(mocks.menuProps?.relativePath).toBe('src')
    expect(mocks.menuProps?.absolutePath).toBe('/repo/src')
    expect(mocks.menuProps?.onView).toBeUndefined()
    // A folder still lists Open to the Side, disabled.
    expect(openToSideItem()).toBeDefined()
    expect(openToSideItem()?.onOpen).toBeUndefined()
    copyFullSource()
    const args = mocks.copy.mock.calls[0]?.[0]
    await expect(args.loadCommitFiles(item)).resolves.toEqual(entries)
  })

  it('Show File History filters the Git Graph to the right-clicked file or folder', () => {
    const openGitGraphTab = vi.fn()
    useAppStore.setState({ openGitGraphTab })
    renderMenu()
    expect(showFileHistoryItem()).toBeUndefined()

    fireEvent.contextMenu(screen.getByText('src/two.ts'))
    showFileHistory()
    // The Git Graph tab's own filter, not the sidebar Commits panel's.
    const tabKey = gitGraphTabFilterKey(buildGitGraphTabId('folder-1'), 'repo-wt')
    expect(getGitHistoryGraphFilter(tabKey)).toMatchObject({
      scope: 'all',
      query: 'path:src/two.ts'
    })
    expect(getGitHistoryGraphFilter('repo-wt').query).toBe('')
    expect(openGitGraphTab).toHaveBeenLastCalledWith('folder-1', {
      repoWorktreeId: 'repo-wt',
      filter: expect.objectContaining({ scope: 'all', query: 'path:src/two.ts' })
    })

    fireEvent.contextMenu(screen.getByText('src folder'))
    showFileHistory()
    expect(getGitHistoryGraphFilter(tabKey).query).toBe('path:src')
    expect(openGitGraphTab).toHaveBeenCalledTimes(2)
  })

  it('Cmd/Ctrl-click builds a selection without opening, and Copy Full Source copies all of it', async () => {
    const onOpenFile = vi.fn()
    renderMenu(defaultModel, onOpenFile)
    // Both modifiers so the test holds on every platform's Cmd-or-Ctrl key.
    fireEvent.click(screen.getByText('src/one.ts'), { metaKey: true, ctrlKey: true })
    fireEvent.click(screen.getByText('src/three.ts'), { metaKey: true, ctrlKey: true })
    expect(onOpenFile).not.toHaveBeenCalled()
    const selected = [...document.querySelectorAll('[data-selected]')].map((el) =>
      el.getAttribute('data-commit-file-path')
    )
    expect(selected).toEqual(['src/one.ts', 'src/three.ts'])

    fireEvent.contextMenu(screen.getByText('src/three.ts'))
    copyFullSource()
    const args = mocks.copy.mock.calls[0]?.[0]
    await expect(args.loadCommitFiles(item)).resolves.toEqual([entries[0], entries[2]])
  })

  it('Shift-click selects the range from the last plain-clicked file', () => {
    const onOpenFile = vi.fn()
    renderMenu(defaultModel, onOpenFile)
    fireEvent.click(screen.getByText('src/one.ts'))
    fireEvent.click(screen.getByText('src/three.ts'), { shiftKey: true })
    expect(onOpenFile).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('[data-selected]')).toHaveLength(3)

    // A plain click drops the bulk selection and opens the row as before.
    fireEvent.click(screen.getByText('src/two.ts'))
    expect(onOpenFile).toHaveBeenCalledTimes(2)
    expect(document.querySelectorAll('[data-selected]')).toHaveLength(0)
  })

  it('right-click outside the selection copies only that file', async () => {
    renderMenu()
    fireEvent.click(screen.getByText('src/one.ts'), { metaKey: true, ctrlKey: true })
    fireEvent.contextMenu(screen.getByText('src/two.ts'))
    copyFullSource()
    const args = mocks.copy.mock.calls[0]?.[0]
    await expect(args.loadCommitFiles(item)).resolves.toEqual([entries[1]])
  })

  it('drops the selection when the same pane switches to another commit', async () => {
    const slot = commitFilesMenuSlot(defaultModel, 'repo-wt', '/repo', async () => entries)
    const other: GitHistoryItem = { ...item, id: 'b'.repeat(40), displayId: 'bbbbbbb' }
    const list = (selectedPaths: ReadonlySet<string>): React.JSX.Element => (
      <div>
        {entries.map((entry) => (
          <button
            key={entry.path}
            type="button"
            data-commit-file-path={entry.path}
            data-selected={selectedPaths.has(entry.path) || undefined}
          >
            {entry.path}
          </button>
        ))}
      </div>
    )
    // Same position, new commit: what the full graph's single details pane does.
    const { rerender } = render(<>{slot([item], entries, vi.fn(), list)}</>)
    fireEvent.click(screen.getByText('src/one.ts'), { metaKey: true, ctrlKey: true })
    fireEvent.click(screen.getByText('src/two.ts'), { metaKey: true, ctrlKey: true })
    expect(document.querySelectorAll('[data-selected]')).toHaveLength(2)

    rerender(<>{slot([other], entries, vi.fn(), list)}</>)
    expect(document.querySelectorAll('[data-selected]')).toHaveLength(0)
    fireEvent.contextMenu(screen.getByText('src/two.ts'))
    copyFullSource()
    const args = mocks.copy.mock.calls[0]?.[0]
    expect(args.items).toEqual([other])
    await expect(args.loadCommitFiles(other)).resolves.toEqual([entries[1]])
  })

  it('copies the selected files across every merged commit', async () => {
    const other: GitHistoryItem = { ...item, id: 'b'.repeat(40), displayId: 'bbbbbbb' }
    const filesOf: Record<string, GitBranchChangeEntry[]> = {
      [item.id]: [entries[0]],
      [other.id]: [entries[0], entries[1], entries[2]]
    }
    const slot = commitFilesMenuSlot(
      defaultModel,
      'repo-wt',
      '/repo',
      async (commit) => filesOf[commit.id] ?? []
    )
    const list = (): React.JSX.Element => (
      <div>
        {entries.map((entry) => (
          <button key={entry.path} type="button" data-commit-file-path={entry.path}>
            {entry.path}
          </button>
        ))}
      </div>
    )
    render(<>{slot([item, other], entries, vi.fn(), list)}</>)
    fireEvent.click(screen.getByText('src/one.ts'), { metaKey: true, ctrlKey: true })
    fireEvent.click(screen.getByText('src/two.ts'), { metaKey: true, ctrlKey: true })
    fireEvent.contextMenu(screen.getByText('src/two.ts'))
    copyFullSource()
    const args = mocks.copy.mock.calls[0]?.[0]
    expect(args.items).toEqual([item, other])
    await expect(args.loadCommitFiles(item)).resolves.toEqual([entries[0]])
    await expect(args.loadCommitFiles(other)).resolves.toEqual([entries[0], entries[1]])
  })

  it('is fed by the upstream Commits panel when a commit expands', async () => {
    const onOpenCommitFile = vi.fn()
    const result: GitHistoryResult = {
      items: [item],
      hasIncomingChanges: false,
      hasOutgoingChanges: false,
      hasMore: false,
      limit: 50
    }
    const renderCommitFilesMenu = vi.fn(
      (
        _items: readonly GitHistoryItem[],
        _entries: readonly GitBranchChangeEntry[],
        _open: unknown,
        renderList: (selectedPaths: ReadonlySet<string>) => React.JSX.Element
      ) => renderList(new Set(['src/two.ts']))
    )
    render(
      <TooltipProvider>
        <GitHistoryPanel
          state={{ status: 'ready', result }}
          collapsed={false}
          onToggle={vi.fn()}
          onRefresh={vi.fn()}
          onLoadCommitFiles={async () => entries}
          onOpenCommitFile={onOpenCommitFile}
          renderCommitFilesMenu={renderCommitFilesMenu}
        />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Show files in commit/ }))
    await screen.findByText('one.ts')

    expect(renderCommitFilesMenu).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: item.id })],
      entries,
      expect.any(Function),
      expect.anything()
    )
    expect(
      document.querySelector('[data-commit-file-path="src/two.ts"][data-selected]')
    ).not.toBeNull()
    expect(document.querySelector('[data-commit-file-path="src/one.ts"][data-selected]')).toBeNull()

    // The shown list rides along so the diff's change arrows can step into the next file.
    fireEvent.click(screen.getByText('one.ts'))
    const commit = expect.objectContaining({ id: item.id })
    expect(onOpenCommitFile).toHaveBeenCalledWith(commit, entries[0], expect.anything(), {
      sequence: entries.map((entry) => ({ entry, head: commit, base: commit }))
    })
  })
})
