// @vitest-environment happy-dom
// Fork seam guard: upstream's explorer must keep handing Copy Full Source to ClipCode.
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TreeNode } from './file-explorer-types'
import { createFileExplorerRowProjection } from './file-explorer-row-projection'
import { visit, type ReactElementLike } from './file-explorer-element-tree-test-harness'

const mocks = vi.hoisted(() => ({ copy: vi.fn() }))
vi.mock('./source-control/clipcode/clipcode-copy-action', () => ({
  copyClipcodeExplorerTargets: mocks.copy
}))

const { FileExplorerFilesTreePane } = await import('./FileExplorerFilesTreePane')
const { FileExplorerVirtualRows } = await import('./FileExplorerVirtualRows')
const { FileExplorerRow } = await import('./FileExplorerRow')

const node = (path: string, isDirectory: boolean): TreeNode => ({
  name: path.split('/').pop() ?? path,
  path,
  relativePath: path.slice('/repo/'.length),
  isDirectory,
  depth: 0
})
const src = node('/repo/src', true)
const readme = node('/repo/README.md', false)
const lib = node('/repo/lib', true)

type PaneProps = ComponentProps<typeof FileExplorerFilesTreePane>
function paneCopyHandler(selectedPaths: Set<string>): (node: TreeNode) => void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: element-tree fixture; only the fields the pane reads before rendering rows are supplied.
  const element = FileExplorerFilesTreePane({
    worktreePath: '/repo',
    displayRootPath: '/repo',
    explorerView: 'files',
    visibleRowCount: 3,
    hasNameFilter: false,
    rowProjection: createFileExplorerRowProjection([src, readme, lib]),
    tree: { loadingDirPaths: new Set(), rootError: null, dirCache: {} },
    selection: { selectedPaths },
    paneState: {
      inlineInputState: {},
      rowScrolling: {},
      handlers: {},
      nodeCommands: {},
      deletion: {},
      dragDrop: { rootDragHandlers: {} }
    }
  } as unknown as PaneProps)
  let handler: unknown
  visit(element, (entry: ReactElementLike) => {
    if (entry.type === FileExplorerVirtualRows) {
      handler = entry.props.onCopyFullSource
    }
  })
  expect(handler).toBeTypeOf('function')
  return (target) => {
    if (typeof handler === 'function') {
      handler(target)
    }
  }
}

describe('explorer Copy Full Source wiring', () => {
  it('copies the multi-selection in explorer order when the row is part of it', () => {
    paneCopyHandler(new Set([lib.path, src.path]))(lib)
    expect(mocks.copy).toHaveBeenLastCalledWith({ worktreePath: '/repo', targets: [src, lib] })
  })

  it('copies only the right-clicked row when it is outside the selection', () => {
    paneCopyHandler(new Set([src.path]))(readme)
    expect(mocks.copy).toHaveBeenLastCalledWith({ worktreePath: '/repo', targets: [readme] })
  })

  it('hands each virtual row its own Copy Full Source', () => {
    const onCopyFullSource = vi.fn()
    const element = FileExplorerVirtualRows({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the rows read only getTotalSize/getVirtualItems/measureElement.
      virtualizer: {
        getTotalSize: () => 26,
        getVirtualItems: () => [{ index: 0, key: 'readme', start: 0 }],
        measureElement: vi.fn()
      } as never,
      inlineInputIndex: -1,
      rowProjection: createFileExplorerRowProjection([readme]),
      inlineInput: null,
      handleInlineSubmit: vi.fn(),
      dismissInlineInput: vi.fn(),
      folderStatusByRelativePath: new Map(),
      statusByRelativePath: new Map(),
      ignoredByRelativePath: new Set(),
      expanded: new Set(),
      loadingDirPaths: new Set<string>(),
      selectedPaths: new Set(),
      activeFileId: null,
      flashingPath: null,
      deleteShortcutLabel: 'Del',
      dirCache: {},
      onClick: vi.fn(),
      onDoubleClick: vi.fn(),
      onViewFile: vi.fn(),
      onContextMenuSelect: vi.fn(),
      onCopyPaths: vi.fn(),
      onCopyFullSource,
      onStartNew: vi.fn(),
      onStartRename: vi.fn(),
      onDuplicate: vi.fn(),
      onAddFolderAsProject: vi.fn(),
      canAddFolderAsProject: () => false,
      onOpenInTerminal: vi.fn(),
      onRequestDelete: vi.fn(),
      onCollapseFolderSubtree: vi.fn(),
      onFindInFolder: vi.fn(),
      onMoveDrop: vi.fn(),
      onDragTargetChange: vi.fn(),
      onDragSourceChange: vi.fn(),
      onDragExpandDir: vi.fn(),
      onNativeDragTargetChange: vi.fn(),
      onNativeDragExpandDir: vi.fn(),
      dropTargetDir: null,
      dragSourcePath: null,
      nativeDropTargetDir: null
    })
    let rowCopy: unknown
    visit(element, (entry) => {
      if (entry.type === FileExplorerRow) {
        rowCopy = entry.props.onCopyFullSource
      }
    })
    expect(rowCopy).toBeTypeOf('function')
    if (typeof rowCopy === 'function') {
      rowCopy()
    }
    expect(onCopyFullSource).toHaveBeenCalledWith(readme)
  })
})
