import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileExplorerRowContextMenu } from './file-explorer-row-context-menu'
import type { TreeNode } from './file-explorer-types'

type ItemProps = { onSelect?: () => void; disabled?: boolean; children?: React.ReactNode }

const items = vi.hoisted(() => ({ list: [] as ItemProps[] }))
const storeState = vi.hoisted(
  (): {
    activeWorktreeId: string
    activeWorkspaceExecutionHostId: 'local' | `runtime:${string}` | null
    openMarkdownPreview: () => void
    settings: { activeRuntimeEnvironmentId: string | null }
    worktreesByRepo: Record<string, { id: string; repoId: string; hostId: 'local' }[]>
    folderWorkspaces: { id: string; projectGroupId: string }[]
    projectGroups: { id: string }[]
  } => ({
    activeWorktreeId: 'wt-1',
    activeWorkspaceExecutionHostId: null,
    openMarkdownPreview: () => {},
    settings: { activeRuntimeEnvironmentId: null },
    worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1', hostId: 'local' }] },
    folderWorkspaces: [{ id: 'fw-1', projectGroupId: 'group-1' }],
    projectGroups: [{ id: 'group-1' }]
  })
)
const revealInFileManager = vi.hoisted(() => vi.fn())

vi.mock('@/components/ui/context-menu', async () => {
  const React_ = await import('react')
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React_.createElement(React_.Fragment, null, children)
  return {
    ContextMenuContent: passthrough,
    ContextMenuItem: (props: ItemProps) => {
      items.list.push(props)
      return React_.createElement(React_.Fragment, null, props.children)
    },
    ContextMenuSeparator: () => null,
    ContextMenuShortcut: () => null
  }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}))

vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => 'Unassigned' }))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/lib/file-preview', () => ({ openFileInBrowserTab: vi.fn() }))

vi.mock(import('@/lib/reveal-in-file-manager'), async (importOriginal) => ({
  ...(await importOriginal()),
  getRevealInFileManagerLabel: () => 'Reveal in Finder',
  revealInFileManager
}))

vi.mock('./file-explorer-row-file-transfer', () => ({
  copyFileToOsClipboard: vi.fn(),
  downloadRemoteFile: vi.fn()
}))

const fileNode: TreeNode = {
  name: 'index.ts',
  path: '/repo/src/index.ts',
  relativePath: 'src/index.ts',
  isDirectory: false,
  depth: 1
}

function renderMenu(
  owner: Partial<
    Pick<React.ComponentProps<typeof FileExplorerRowContextMenu>, 'node' | 'onCopyFullSource'>
  > = {}
): void {
  renderToStaticMarkup(
    <FileExplorerRowContextMenu
      node={fileNode}
      isExpanded={false}
      deleteShortcutLabel=""
      targetDir="/repo/src"
      targetDepth={1}
      selectionSize={1}
      onViewFile={vi.fn()}
      onCopyPaths={vi.fn()}
      onStartNew={vi.fn()}
      onStartRename={vi.fn()}
      onDuplicate={vi.fn()}
      onRequestDelete={vi.fn()}
      canOpenInOrcaBrowser={false}
      canCollapseFolderSubtree={false}
      canAddAsProject={false}
      onAddFolderAsProject={vi.fn()}
      onOpenInTerminal={vi.fn()}
      onCollapseFolderSubtree={vi.fn()}
      onFindInFolder={vi.fn()}
      {...owner}
    />
  )
}

describe('FileExplorerRowContextMenu ClipCode actions', () => {
  beforeEach(() => {
    items.list = []
  })

  it('offers ClipCode Copy Full Source only when the pane wires it', () => {
    const findCopyFullSource = (): ItemProps | undefined =>
      items.list.find((item) => React.Children.toArray(item.children).includes('Copy Full Source'))
    renderMenu()
    expect(findCopyFullSource()).toBeUndefined()

    items.list = []
    const onCopyFullSource = vi.fn()
    renderMenu({ node: { ...fileNode, isDirectory: true }, onCopyFullSource })
    findCopyFullSource()?.onSelect?.()
    expect(onCopyFullSource).toHaveBeenCalledTimes(1)
  })
})
