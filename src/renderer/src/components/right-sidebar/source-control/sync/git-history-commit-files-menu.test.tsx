// @vitest-environment happy-dom
// Fork seam guard: upstream's Commits panel must keep handing expanded files to the fork's menu.
import type React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'

type MenuProps = {
  relativePath?: string
  absolutePath?: string
  onView?: () => void
  onCopyFullSource?: () => void
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

const { GitHistoryCommitFilesMenu } = await import('./git-history-commit-files-menu')
const { GitHistoryPanel } = await import('./git-history-panel')

const item: GitHistoryItem = {
  id: 'a'.repeat(40),
  displayId: 'aaaaaaa',
  parentIds: [],
  subject: 'Alpha',
  message: 'Alpha'
}
const entries: GitBranchChangeEntry[] = [
  { path: 'src/one.ts', status: 'modified' },
  { path: 'src/two.ts', status: 'added' }
]

afterEach(() => {
  cleanup()
  mocks.menuProps = null
  vi.clearAllMocks()
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
    render(
      <GitHistoryCommitFilesMenu
        {...{ model, item, entries, onOpenFile }}
        worktreeId="repo-wt"
        worktreePath="/repo"
      >
        <div>
          {entries.map((entry) => (
            <button key={entry.path} type="button" data-commit-file-path={entry.path}>
              <span>{entry.path}</span>
            </button>
          ))}
          <span>Open all</span>
        </div>
      </GitHistoryCommitFilesMenu>
    )

    // A prevented contextmenu is what keeps Radix from opening an all-disabled menu.
    expect(fireEvent.contextMenu(screen.getByText('Open all'))).toBe(false)
    fireEvent.contextMenu(screen.getByText('src/two.ts'))

    expect(mocks.menuProps?.relativePath).toBe('src/two.ts')
    expect(mocks.menuProps?.absolutePath).toBe('/repo/src/two.ts')
    mocks.menuProps?.onView?.()
    expect(onOpenFile).toHaveBeenCalledWith(entries[1], expect.objectContaining({ altKey: false }))
    mocks.menuProps?.onRevealInExplorer('repo-wt', '/repo/src/two.ts')
    expect(model.revealInExplorer).toHaveBeenCalledWith('folder-1', '/repo/src/two.ts')
    mocks.menuProps?.onCopyFullSource?.()
    const args = mocks.copy.mock.calls[0]?.[0]
    expect(args).toMatchObject({
      items: [item],
      worktreeId: 'repo-wt',
      editorWorktreeId: 'folder-1'
    })
    await expect(args.loadCommitFiles(item)).resolves.toEqual([entries[1]])
  })

  it('is fed by the upstream Commits panel when a commit expands', async () => {
    const result: GitHistoryResult = {
      items: [item],
      hasIncomingChanges: false,
      hasOutgoingChanges: false,
      hasMore: false,
      limit: 50
    }
    const renderCommitFilesMenu = vi.fn(
      (
        _item: GitHistoryItem,
        _entries: readonly GitBranchChangeEntry[],
        _open: unknown,
        list: React.JSX.Element
      ) => list
    )
    render(
      <TooltipProvider>
        <GitHistoryPanel
          state={{ status: 'ready', result }}
          collapsed={false}
          onToggle={vi.fn()}
          onRefresh={vi.fn()}
          onLoadCommitFiles={async () => entries}
          onOpenCommitFile={vi.fn()}
          renderCommitFilesMenu={renderCommitFilesMenu}
        />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /Show files in commit/ }))
    await screen.findByText('one.ts')

    expect(renderCommitFilesMenu).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: item.id }),
      entries,
      expect.any(Function),
      expect.anything()
    )
    expect(document.querySelector('[data-commit-file-path="src/two.ts"]')).not.toBeNull()
  })
})
