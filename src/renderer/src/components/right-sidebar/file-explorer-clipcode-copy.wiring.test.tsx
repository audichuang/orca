// @vitest-environment happy-dom
// Fork seam guard: upstream's explorer must keep rendering ClipCode's Copy Full Source in its row menu.
import '@testing-library/jest-dom/vitest'

import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../store/slices/worktrees-slice-test-fixtures'
import type { TreeNode } from './file-explorer-types'
import { createFileExplorerRowProjection } from './file-explorer-row-projection'
import { visit, type ReactElementLike } from './file-explorer-element-tree-test-harness'

const mocks = vi.hoisted(() => ({ readRuntimeFileContent: vi.fn(), writeClipboardText: vi.fn() }))
vi.mock('@/runtime/runtime-file-read-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readRuntimeFileContent: mocks.readRuntimeFileContent
}))

const { FileExplorerFilesTreePane } = await import('./FileExplorerFilesTreePane')
const { ClipcodeExplorerVirtualRows } =
  await import('./source-control/clipcode/clipcode-explorer-rows')

const file = (name: string): TreeNode => ({
  name,
  path: `/repo/${name}`,
  relativePath: name,
  isDirectory: false,
  depth: 0
})
const a = file('a.ts')
const b = file('b.ts')
const c = file('c.ts')

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    repos: [{ id: 'repo-1', path: '/repo', displayName: 'repo', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: {
      'repo-1': [makeWorktree({ id: 'wt-1', repoId: 'repo-1', path: '/repo', hostId: 'local' })]
    },
    activeWorktreeId: 'wt-1'
  })
  vi.stubGlobal('api', {
    ...window.api,
    ui: { ...window.api?.ui, writeClipboardText: mocks.writeClipboardText }
  })
  mocks.readRuntimeFileContent.mockImplementation(async (args: { relativePath: string }) => ({
    content: `content of ${args.relativePath}`,
    isBinary: false
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

type RowsProps = ComponentProps<typeof ClipcodeExplorerVirtualRows>

function renderRows(selectedPaths: Set<string>): void {
  const nodes = [a, b, c]
  const props: RowsProps = {
    clipcodeWorktreePath: '/repo',
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the rows read only getTotalSize/getVirtualItems/measureElement.
    virtualizer: {
      getTotalSize: () => 78,
      getVirtualItems: () =>
        nodes.map((node, index) => ({ index, key: node.path, start: index * 26 })),
      measureElement: vi.fn()
    } as never,
    inlineInputIndex: -1,
    rowProjection: createFileExplorerRowProjection(nodes),
    inlineInput: null,
    handleInlineSubmit: vi.fn(),
    dismissInlineInput: vi.fn(),
    folderStatusByRelativePath: new Map(),
    statusByRelativePath: new Map(),
    ignoredByRelativePath: new Set(),
    expanded: new Set(),
    loadingDirPaths: new Set<string>(),
    selectedPaths,
    activeFileId: null,
    flashingPath: null,
    deleteShortcutLabel: 'Del',
    dirCache: {},
    onClick: vi.fn(),
    onDoubleClick: vi.fn(),
    onViewFile: vi.fn(),
    onContextMenuSelect: vi.fn(),
    onCopyPaths: vi.fn(),
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
  }
  render(
    <TooltipProvider>
      <ClipcodeExplorerVirtualRows {...props} />
    </TooltipProvider>
  )
}

async function copyFullSourceFrom(name: string): Promise<string> {
  fireEvent.contextMenu(screen.getByText(name))
  const labels = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
  // Why: ClipCode's item sits right after upstream's Copy Relative Path.
  const relative = labels.findIndex((label) => label?.startsWith('Copy Relative Path'))
  expect(relative).toBeGreaterThan(0)
  expect(labels[relative + 1]).toBe('Copy Full Source')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Full Source' }))
  await vi.waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledTimes(1))
  return String(mocks.writeClipboardText.mock.calls[0]?.[0])
}

describe('explorer Copy Full Source wiring', () => {
  it('the tree pane renders its rows with ClipCode actions for the worktree', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: element-tree fixture; only the fields the pane reads before rendering rows are supplied.
    const element = FileExplorerFilesTreePane({
      worktreePath: '/repo',
      displayRootPath: '/repo',
      explorerView: 'files',
      visibleRowCount: 3,
      hasNameFilter: false,
      rowProjection: createFileExplorerRowProjection([a, b, c]),
      tree: { loadingDirPaths: new Set(), rootError: null, dirCache: {} },
      selection: { selectedPaths: new Set() },
      paneState: {
        inlineInputState: {},
        rowScrolling: {},
        handlers: {},
        nodeCommands: {},
        deletion: {},
        dragDrop: { rootDragHandlers: {} }
      }
    } as unknown as ComponentProps<typeof FileExplorerFilesTreePane>)
    let rows: ReactElementLike | undefined
    visit(element, (entry) => {
      if (entry.type === ClipcodeExplorerVirtualRows) {
        rows = entry
      }
    })
    expect(rows?.props.clipcodeWorktreePath).toBe('/repo')
  })

  it('copies the multi-selection in explorer order when the row is part of it', async () => {
    renderRows(new Set([c.path, a.path]))
    const payload = await copyFullSourceFrom('c.ts')
    expect(payload.indexOf('content of a.ts')).toBeGreaterThanOrEqual(0)
    expect(payload.indexOf('content of a.ts')).toBeLessThan(payload.indexOf('content of c.ts'))
    expect(payload).not.toContain('content of b.ts')
  })

  it('copies only the right-clicked row when it is outside the selection', async () => {
    renderRows(new Set([a.path]))
    const payload = await copyFullSourceFrom('b.ts')
    expect(payload).toContain('content of b.ts')
    expect(payload).not.toContain('content of a.ts')
  })
})
