// @vitest-environment happy-dom
// Fork seam guard: the explorer row menu offers "Duplicate as _result.txt" and copies through the real runtime clients.
import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../store/slices/worktrees-slice-test-fixtures'
import type { TreeNode } from './file-explorer-types'
import { FileExplorerRowContextMenu } from './file-explorer-row-context-menu'
import { DuplicateAsResultRefreshContext } from './file-explorer-duplicate-as-result'
import { toast } from 'sonner'

const mocks = vi.hoisted(() => ({ copy: vi.fn(), pathExists: vi.fn(), refreshDir: vi.fn() }))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const node = (name: string, isDirectory = false): TreeNode => ({
  name,
  path: `/repo/sql/${name}`,
  relativePath: `sql/${name}`,
  isDirectory,
  depth: 1,
  operationOwner: { kind: 'local' }
})

function renderMenu(target: TreeNode): void {
  render(
    <DuplicateAsResultRefreshContext.Provider value={mocks.refreshDir}>
      <TooltipProvider>
        <ContextMenu>
          <ContextMenuTrigger>row</ContextMenuTrigger>
          <FileExplorerRowContextMenu
            node={target}
            isExpanded={false}
            deleteShortcutLabel=""
            targetDir="/repo/sql"
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
          />
        </ContextMenu>
      </TooltipProvider>
    </DuplicateAsResultRefreshContext.Provider>
  )
  fireEvent.contextMenu(screen.getByText('row'))
}

const LABEL = 'Duplicate as _result.txt'

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
    fs: { ...window.api?.fs, copy: mocks.copy, pathExists: mocks.pathExists }
  })
  mocks.copy.mockResolvedValue(undefined)
  mocks.pathExists.mockResolvedValue(false)
  mocks.refreshDir.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Duplicate as _result.txt menu item', () => {
  it('shows for a file, right after Duplicate, and not for a directory', async () => {
    renderMenu(node('x.sql'))
    const labels = (await screen.findAllByRole('menuitem')).map((item) => item.textContent)
    const duplicate = labels.indexOf('Duplicate')
    expect(duplicate).toBeGreaterThan(0)
    expect(labels[duplicate + 1]).toBe(LABEL)

    cleanup()
    renderMenu(node('sql', true))
    await screen.findAllByRole('menuitem')
    expect(screen.queryByRole('menuitem', { name: LABEL })).toBeNull()
  })

  it('copies x.sql to x.sql_result.txt in the same directory and opens it', async () => {
    renderMenu(node('x.sql'))
    fireEvent.click(await screen.findByRole('menuitem', { name: LABEL }))
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(1))
    expect(mocks.copy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePath: '/repo/sql/x.sql',
        destinationPath: '/repo/sql/x.sql_result.txt'
      })
    )
    await vi.waitFor(() =>
      expect(useAppStore.getState().openFiles.map((f) => f.filePath)).toEqual([
        '/repo/sql/x.sql_result.txt'
      ])
    )
    const opened = useAppStore.getState().openFiles[0]
    expect(opened).toMatchObject({ relativePath: 'sql/x.sql_result.txt', worktreeId: 'wt-1' })
  })

  it('appends to an extensionless name', async () => {
    renderMenu(node('notes'))
    fireEvent.click(await screen.findByRole('menuitem', { name: LABEL }))
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(1))
    expect(mocks.copy.mock.calls[0]?.[0]).toMatchObject({
      destinationPath: '/repo/sql/notes_result.txt'
    })
  })

  it('does not overwrite: an existing x.sql_result.txt moves the copy to x.sql_result_2.txt', async () => {
    mocks.pathExists.mockImplementation(
      async (args: { filePath: string }) => args.filePath === '/repo/sql/x.sql_result.txt'
    )
    renderMenu(node('x.sql'))
    fireEvent.click(await screen.findByRole('menuitem', { name: LABEL }))
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(1))
    expect(mocks.copy.mock.calls[0]?.[0]).toMatchObject({
      destinationPath: '/repo/sql/x.sql_result_2.txt'
    })
    await vi.waitFor(() =>
      expect(useAppStore.getState().openFiles.map((f) => f.filePath)).toEqual([
        '/repo/sql/x.sql_result_2.txt'
      ])
    )
  })

  it('retries the next name when the exclusive copy reports EEXIST', async () => {
    mocks.copy.mockRejectedValueOnce(new Error('EEXIST: file already exists'))
    renderMenu(node('x.sql'))
    fireEvent.click(await screen.findByRole('menuitem', { name: LABEL }))
    await vi.waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(2))
    expect(mocks.copy.mock.calls[1]?.[0]).toMatchObject({
      destinationPath: '/repo/sql/x.sql_result_2.txt'
    })
  })

  it('refreshes the parent directory after the copy and before opening it, for watcher-ignored dirs', async () => {
    const order: string[] = []
    mocks.copy.mockImplementation(async () => void order.push('copy'))
    mocks.refreshDir.mockImplementation(async () => void order.push('refresh'))
    renderMenu(node('x.sql'))
    fireEvent.click(await screen.findByRole('menuitem', { name: LABEL }))
    await vi.waitFor(() => expect(useAppStore.getState().openFiles).toHaveLength(1))
    expect(mocks.refreshDir).toHaveBeenCalledExactlyOnceWith('/repo/sql')
    expect(order).toEqual(['copy', 'refresh'])
  })

  it('a failed refresh neither shows an error nor stops the file from opening', async () => {
    mocks.refreshDir.mockRejectedValue(new Error('refresh failed'))
    renderMenu(node('x.sql'))
    fireEvent.click(await screen.findByRole('menuitem', { name: LABEL }))
    await vi.waitFor(() => expect(mocks.refreshDir).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(useAppStore.getState().openFiles).toHaveLength(1))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('does not refresh when the copy fails', async () => {
    mocks.copy.mockRejectedValue(new Error('EACCES: permission denied'))
    renderMenu(node('x.sql'))
    fireEvent.click(await screen.findByRole('menuitem', { name: LABEL }))
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(mocks.refreshDir).not.toHaveBeenCalled()
  })
})
