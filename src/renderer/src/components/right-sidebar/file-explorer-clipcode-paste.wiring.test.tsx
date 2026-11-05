// @vitest-environment happy-dom
// Fork seam guard: upstream's explorer header must keep rendering the ClipCode Paste & Restore slot, rooted at the workspace.
import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../store/slices/worktrees-slice-test-fixtures'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }))

const { default: FileExplorer } = await import('./file-explorer/panel/FileExplorer')
const { ClipcodeExplorerPasteButton } =
  await import('./source-control/clipcode/clipcode-explorer-paste-button')

const PAYLOAD = '// File: src/pasted.ts\nexport const pasted = 1\n'
const files = new Map<string, string>()

function childrenOf(dirPath: string) {
  const entries = new Map<string, boolean>()
  for (const path of files.keys()) {
    if (path.startsWith(`${dirPath}/`)) {
      const [name, ...rest] = path.slice(dirPath.length + 1).split('/')
      entries.set(name, rest.length > 0 || entries.get(name) === true)
    }
  }
  return [...entries].map(([name, isDirectory]) => ({ name, isDirectory, isSymlink: false }))
}

const fsStub = {
  readDir: vi.fn(async (args: { dirPath: string }) => childrenOf(args.dirPath)),
  stat: vi.fn(async (args: { filePath: string }) => {
    const isDirectory = childrenOf(args.filePath).length > 0
    if (!isDirectory && !files.has(args.filePath)) {
      throw new Error('ENOENT: no such file')
    }
    return { size: 1, isDirectory, mtime: 0 }
  }),
  readFile: vi.fn(async (args: { filePath: string }) => ({
    content: files.get(args.filePath) ?? '',
    isBinary: false
  })),
  onFsChanged: vi.fn(() => () => undefined),
  createDir: vi.fn(async () => undefined),
  writeFile: vi.fn(async (args: { filePath: string; content: string }) => {
    files.set(args.filePath, args.content)
    return { ok: true }
  })
}
const readClipboardText = vi.fn()
const confirmDialog = vi.fn()

function seedRepoWorkspace(): string {
  useAppStore.setState({
    repos: [{ id: 'repo-1', path: '/repo', displayName: 'repo', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: {
      'repo-1': [makeWorktree({ id: 'wt-1', repoId: 'repo-1', path: '/repo', hostId: 'local' })]
    },
    activeWorktreeId: 'wt-1'
  })
  return '/repo'
}

function seedFolderWorkspace(): string {
  const key = folderWorkspaceKey('folder-1')
  useAppStore.setState({
    folderWorkspaces: [
      {
        id: 'folder-1',
        projectGroupId: 'group-1',
        name: 'work',
        folderPath: '/work',
        connectionId: null,
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    activeWorktreeId: key
  })
  return '/work'
}

beforeEach(() => {
  files.clear()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ rightSidebarOpen: true, rightSidebarTab: 'explorer' })
  vi.stubGlobal('api', {
    ...window.api,
    ui: { ...window.api?.ui, readClipboardText },
    fs: { ...window.api?.fs, ...fsStub }
  })
  readClipboardText.mockResolvedValue(PAYLOAD)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe.each([
  ['repo workspace', seedRepoWorkspace],
  ['folder workspace', seedFolderWorkspace]
])('explorer Paste & Restore wiring (%s)', (_name, seed) => {
  it('shows the header button and restores the clipboard payload under the workspace root', async () => {
    const root = seed()
    files.set(`${root}/README.md`, 'existing')
    render(
      <ConfirmationDialogContext.Provider value={confirmDialog}>
        <TooltipProvider>
          <FileExplorer />
        </TooltipProvider>
      </ConfirmationDialogContext.Provider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Paste & Restore' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /^(Restore|Create)/ }))
    await waitFor(() => expect(fsStub.writeFile).toHaveBeenCalledTimes(1))
    expect(fsStub.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: `${root}/src/pasted.ts`,
        content: 'export const pasted = 1'
      })
    )
    // The explorer reloads its root after the restore; the restore's own listings all precede the write.
    await waitFor(() => {
      const [writeOrder] = fsStub.writeFile.mock.invocationCallOrder
      expect(Math.max(...fsStub.readDir.mock.invocationCallOrder)).toBeGreaterThan(writeOrder)
    })
  })
})

describe('explorer Paste & Restore button gating', () => {
  it('is hidden when the workspace owner cannot be resolved', () => {
    seedRepoWorkspace()
    render(
      <TooltipProvider>
        <ClipcodeExplorerPasteButton
          workspaceKey="wt-unknown"
          rootPath="/repo"
          onRestored={vi.fn()}
        />
      </TooltipProvider>
    )
    expect(screen.queryByRole('button', { name: 'Paste & Restore' })).toBeNull()
  })
})

describe('explorer Paste & Restore across workspace switches', () => {
  function seedTwoWorkspacesOnOneHost(): void {
    useAppStore.setState({
      repos: [{ id: 'repo-1', path: '/repo', displayName: 'repo', badgeColor: '#000', addedAt: 0 }],
      worktreesByRepo: {
        'repo-1': [
          makeWorktree({ id: 'wt-1', repoId: 'repo-1', path: '/repo', hostId: 'local' }),
          makeWorktree({ id: 'wt-2', repoId: 'repo-1', path: '/repo-b', hostId: 'local' })
        ]
      },
      activeWorktreeId: 'wt-1'
    })
    files.set('/repo/README.md', 'a')
    files.set('/repo-b/README.md', 'b')
  }

  function renderExplorer(): void {
    render(
      <ConfirmationDialogContext.Provider value={confirmDialog}>
        <TooltipProvider>
          <FileExplorer />
        </TooltipProvider>
      </ConfirmationDialogContext.Provider>
    )
  }

  function switchTo(worktreeId: string): void {
    act(() => useAppStore.setState({ activeWorktreeId: worktreeId }))
  }

  it('drops an open preview when the active workspace changes', async () => {
    seedTwoWorkspacesOnOneHost()
    renderExplorer()
    fireEvent.click(await screen.findByRole('button', { name: 'Paste & Restore' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    switchTo('wt-2')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(fsStub.writeFile).not.toHaveBeenCalled()
  })

  it('discards a restore still preparing when the active workspace changes', async () => {
    seedTwoWorkspacesOnOneHost()
    let resolveClipboard: (text: string) => void = () => undefined
    readClipboardText.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveClipboard = resolve
      })
    )
    renderExplorer()
    fireEvent.click(await screen.findByRole('button', { name: 'Paste & Restore' }))
    switchTo('wt-2')
    await act(async () => resolveClipboard(PAYLOAD))
    // The last per-path stat precedes the session being set; flush once more after it.
    await waitFor(() =>
      expect(fsStub.stat).toHaveBeenCalledWith(
        expect.objectContaining({ filePath: '/repo/src/pasted.ts' })
      )
    )
    await act(async () => undefined)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fsStub.writeFile).not.toHaveBeenCalled()
  })
})
