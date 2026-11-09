// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const calls: string[] = []
const readRuntimeDirectory = vi.fn()
const statRuntimePath = vi.fn()
const readRuntimeFileContent = vi.fn()
const readRuntimeFileBytes = vi.fn()
const writeRuntimeFile = vi.fn()

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/runtime/files/reads/runtime-directory-read', () => ({
  readRuntimeDirectory: (...args: unknown[]) => readRuntimeDirectory(...args)
}))
vi.mock('@/runtime/files/mutations/runtime-file-mutation-client', () => ({
  writeRuntimeFile: (...args: unknown[]) => writeRuntimeFile(...args),
  deleteRuntimePath: async (_c: unknown, path: string) => void calls.push(`delete ${path}`),
  createRuntimePath: async () => undefined
}))
vi.mock('@/runtime/files/metadata/runtime-file-metadata-client', () => ({
  statRuntimePath: (...args: unknown[]) => statRuntimePath(...args),
  isMissingRuntimePathError: (error: unknown) => String(error).includes('ENOENT')
}))
vi.mock('@/runtime/files/mutations/runtime-file-bytes-write', () => ({
  writeRuntimeFileBytes: async (_c: unknown, path: string, bytes: Uint8Array) =>
    void calls.push(`write bytes ${path} ${[...bytes].join(',')}`)
}))
vi.mock('@/runtime/files/reads/runtime-paged-file-read', () => ({
  readRuntimeFileBytes: (...args: unknown[]) => readRuntimeFileBytes(...args)
}))
vi.mock('@/runtime/files/reads/runtime-file-read-client', () => ({
  readRuntimeFileContent: (...args: unknown[]) => readRuntimeFileContent(...args)
}))
vi.mock('./clipcode-restore-parent-directories', () => ({
  createParentDirectoriesForNewFile: async () => undefined
}))
vi.mock('../../file-explorer/navigation/file-explorer-operation-owner', () => ({
  captureFileExplorerOperationGuard: () => ({
    route: { target: { kind: 'local' } },
    assertCurrent: () => undefined
  }),
  getFileExplorerOperationOwner: () => undefined
}))
vi.mock('@/components/editor/autosave/editor-autosave', () => ({
  requestEditorSaveQuiesce: async (target: { worktreeId: string; relativePath: string }) => {
    calls.push(`quiesce ${target.worktreeId}:${target.relativePath}`)
    return () => void calls.push(`release ${target.worktreeId}:${target.relativePath}`)
  },
  notifyEditorExternalFileChange: (target: { worktreeId: string; relativePath: string }) =>
    void calls.push(`notify ${target.worktreeId}:${target.relativePath}`)
}))

const { useClipcodeRestore } = await import('./use-clipcode-restore')

function Harness(): React.JSX.Element {
  const { requestRestore, dialog } = useClipcodeRestore({
    workspaceKey: 'folder-1',
    rootPath: '/f',
    repoWorktrees: [{ id: 'repo-a::/f/a', path: '/f/a' }],
    onRestored: vi.fn()
  })
  return (
    <>
      <button onClick={requestRestore}>go</button>
      {dialog}
    </>
  )
}

async function runRestore(clipboard: string, { overwrite = false } = {}): Promise<void> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook only reads window.api.ui.readClipboardText.
  window.api = { ui: { readClipboardText: async () => clipboard } } as never
  render(<Harness />)
  fireEvent.click(screen.getByText('go'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument())
  if (overwrite) {
    fireEvent.click(screen.getByRole('checkbox'))
  }
  const button = screen.getByRole('button', { name: 'Restore' })
  if (!button.hasAttribute('disabled')) {
    await act(async () => fireEvent.click(button))
  }
}

beforeEach(() => {
  calls.length = 0
  statRuntimePath.mockRejectedValue(new Error('ENOENT'))
  readRuntimeFileContent.mockResolvedValue({ content: 'old', isBinary: false })
  readRuntimeFileBytes.mockResolvedValue({ kind: 'unsupported' })
  writeRuntimeFile.mockImplementation(async (_c: unknown, path: string) => {
    calls.push(`write ${path}`)
  })
  readRuntimeDirectory.mockImplementation(async (_c: unknown, dir: string) =>
    dir === '/f' ? [{ name: 'git-alias', isDirectory: true, isSymlink: true }] : []
  )
})
afterEach(cleanup)

describe('useClipcodeRestore', () => {
  it('never writes through a symlinked directory', async () => {
    await runRestore('// file: [NEW] git-alias/config\nx\n')
    expect(calls).toEqual([])
  })

  it('never writes a copy-time size-skip placeholder', async () => {
    await runRestore('// file: [NEW] big.ts\n// File skipped: size exceeds limit (600000 bytes)\n')
    expect(calls).toEqual([])
  })

  it('drains editor saves before writing, notifies after, then releases the autosave hold', async () => {
    await runRestore('// file: [NEW] ok.ts\nx\n')
    expect(calls).toEqual([
      'quiesce folder-1:ok.ts',
      'write /f/ok.ts',
      'notify folder-1:ok.ts',
      'release folder-1:ok.ts'
    ])
  })

  it('also quiesces and notifies tabs owned by the repo worktree containing the file', async () => {
    await runRestore('// file: [NEW] a/src/x.ts\nx\n')
    expect(calls).toEqual([
      'quiesce folder-1:a/src/x.ts',
      'quiesce repo-a::/f/a:src/x.ts',
      'write /f/a/src/x.ts',
      'notify folder-1:a/src/x.ts',
      'notify repo-a::/f/a:src/x.ts',
      'release folder-1:a/src/x.ts',
      'release repo-a::/f/a:src/x.ts'
    ])
  })

  it('drains editor saves before a delete, notifies after, then releases the autosave hold', async () => {
    statRuntimePath.mockResolvedValue({ isDirectory: false, size: 4, mtime: 0 })
    await runRestore('// file: [DELETED] a/src/gone.ts\n')
    expect(calls).toEqual([
      'quiesce folder-1:a/src/gone.ts',
      'quiesce repo-a::/f/a:src/gone.ts',
      'delete /f/a/src/gone.ts',
      'notify folder-1:a/src/gone.ts',
      'notify repo-a::/f/a:src/gone.ts',
      'release folder-1:a/src/gone.ts',
      'release repo-a::/f/a:src/gone.ts'
    ])
  })

  it('skips an entry whose parent is a file and still restores the others', async () => {
    readRuntimeDirectory.mockImplementation(async (_c: unknown, dir: string) =>
      dir === '/f' ? [{ name: 'README.md', isDirectory: false, isSymlink: false }] : []
    )
    await runRestore('// file: [NEW] README.md/child.ts\nx\n// file: [NEW] ok.txt\nok\n')
    expect(calls).toEqual([
      'quiesce folder-1:ok.txt',
      'write /f/ok.txt',
      'notify folder-1:ok.txt',
      'release folder-1:ok.txt'
    ])
  })

  it('overwrites an existing UTF-8 file but never a non-UTF-8 one', async () => {
    statRuntimePath.mockResolvedValue({ isDirectory: false, size: 4, mtime: 0 })
    readRuntimeFileContent.mockImplementation(async ({ filePath }: { filePath: string }) => ({
      content: filePath === '/f/latin1.txt' ? 'caf\uFFFD' : 'old',
      isBinary: false
    }))
    await runRestore('// file: latin1.txt\ncafé\n// file: ok.txt\nnew\n', { overwrite: true })
    expect(calls).toEqual([
      'quiesce folder-1:ok.txt',
      'write /f/ok.txt',
      'notify folder-1:ok.txt',
      'release folder-1:ok.txt'
    ])
  })

  it('skips an entry whose target cannot be stat-ed instead of failing the whole restore', async () => {
    statRuntimePath.mockImplementation(async (_c: unknown, path: string) => {
      throw new Error(path === '/f/locked.ts' ? 'EACCES: permission denied' : 'ENOENT')
    })
    await runRestore('// file: [NEW] locked.ts\nx\n// file: [NEW] ok.txt\nok\n')
    expect(calls).toEqual([
      'quiesce folder-1:ok.txt',
      'write /f/ok.txt',
      'notify folder-1:ok.txt',
      'release folder-1:ok.txt'
    ])
  })

  it('blocks a symlink whose name differs only by Unicode normalization', async () => {
    readRuntimeDirectory.mockImplementation(async (_c: unknown, dir: string) =>
      dir === '/f' ? [{ name: 'cafe\u0301', isDirectory: true, isSymlink: true }] : []
    )
    await runRestore('// file: [NEW] caf\u00e9/config\nx\n')
    expect(calls).toEqual([])
  })

  it('writes a non-text entry as bytes and leaves a target that already holds them unchanged', async () => {
    const sha = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'
    const body = `// File skipped: non-text file, 3 bytes, sha256 ${sha}; base64 follows\nAQID\n`
    statRuntimePath.mockImplementation(async (_c: unknown, path: string) => {
      if (path === '/f/same.bin') {
        return { isDirectory: false, size: 3, mtime: 0 }
      }
      throw new Error('ENOENT')
    })
    readRuntimeFileContent.mockResolvedValue({ content: '', isBinary: true })
    readRuntimeFileBytes.mockResolvedValue({ kind: 'ok', bytes: new Uint8Array([1, 2, 3]) })
    await runRestore(`// file: same.bin\n${body}// file: new.bin\n${body}`)
    expect(calls.filter((call) => call.startsWith('write'))).toEqual([
      'write bytes /f/new.bin 1,2,3'
    ])
    expect(toast.success).toHaveBeenLastCalledWith(
      'Created 1, overwritten 0, deleted 0, skipped 0. Unchanged: 1.'
    )
  })

  it('counts a failed write as skipped and names it in user text, not the OS message', async () => {
    writeRuntimeFile.mockImplementation(async (_c: unknown, path: string) => {
      if (path === '/f/locked.ts') {
        throw new Error("EACCES: permission denied, open '/f/locked.ts'")
      }
      calls.push(`write ${path}`)
    })
    await runRestore('// file: [NEW] locked.ts\nx\n// file: [NEW] ok.txt\nok\n')
    expect(calls).toContain('write /f/ok.txt')
    expect(toast.error).toHaveBeenLastCalledWith(
      'Created 1, overwritten 0, deleted 0, skipped 1. Failed 1.',
      { description: 'locked.ts: Folder is not writable' }
    )
  })
})
