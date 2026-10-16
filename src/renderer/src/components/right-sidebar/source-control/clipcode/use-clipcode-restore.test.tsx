// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const calls: string[] = []
const readRuntimeDirectory = vi.fn()
const statRuntimePath = vi.fn()

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }))
vi.mock('@/runtime/runtime-file-mutation-client', () => ({
  readRuntimeDirectory: (...args: unknown[]) => readRuntimeDirectory(...args),
  writeRuntimeFile: async (_c: unknown, path: string) => void calls.push(`write ${path}`),
  deleteRuntimePath: async (_c: unknown, path: string) => void calls.push(`delete ${path}`),
  createRuntimePath: async () => undefined
}))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({
  statRuntimePath: (...args: unknown[]) => statRuntimePath(...args),
  isMissingRuntimePathError: (error: unknown) => String(error).includes('ENOENT')
}))
vi.mock('@/components/tab-bar/tab-create-entry-action', () => ({
  createParentDirectoriesForNewFile: async () => undefined
}))
vi.mock('../../file-explorer-operation-owner', () => ({
  captureFileExplorerOperationGuard: () => ({
    route: { target: { kind: 'local' } },
    assertCurrent: () => undefined
  }),
  getFileExplorerOperationOwner: () => undefined
}))
vi.mock('@/components/editor/editor-autosave', () => ({
  requestEditorSaveQuiesce: async (target: { worktreeId: string; relativePath: string }) =>
    void calls.push(`quiesce ${target.worktreeId}:${target.relativePath}`),
  notifyEditorExternalFileChange: (target: { worktreeId: string; relativePath: string }) =>
    void calls.push(`notify ${target.worktreeId}:${target.relativePath}`)
}))

const { useClipcodeRestore } = await import('./use-clipcode-restore')

function Harness(): React.JSX.Element {
  const { requestRestore, dialog } = useClipcodeRestore({
    folderWorkspaceKey: 'folder-1',
    folderPath: '/f',
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

async function runRestore(clipboard: string): Promise<void> {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook only reads window.api.ui.readClipboardText.
  window.api = { ui: { readClipboardText: async () => clipboard } } as never
  render(<Harness />)
  fireEvent.click(screen.getByText('go'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument())
  const button = screen.getByRole('button', { name: 'Restore' })
  if (!button.hasAttribute('disabled')) {
    await act(async () => fireEvent.click(button))
  }
}

beforeEach(() => {
  calls.length = 0
  statRuntimePath.mockRejectedValue(new Error('ENOENT'))
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

  it('drains editor saves before writing and notifies after', async () => {
    await runRestore('// file: [NEW] ok.ts\nx\n')
    expect(calls).toEqual(['quiesce folder-1:ok.ts', 'write /f/ok.ts', 'notify folder-1:ok.ts'])
  })

  it('also quiesces and notifies tabs owned by the repo worktree containing the file', async () => {
    await runRestore('// file: [NEW] a/src/x.ts\nx\n')
    expect(calls).toEqual([
      'quiesce folder-1:a/src/x.ts',
      'quiesce repo-a::/f/a:src/x.ts',
      'write /f/a/src/x.ts',
      'notify folder-1:a/src/x.ts',
      'notify repo-a::/f/a:src/x.ts'
    ])
  })

  it('blocks a symlink whose name differs only by Unicode normalization', async () => {
    readRuntimeDirectory.mockImplementation(async (_c: unknown, dir: string) =>
      dir === '/f' ? [{ name: 'cafe\u0301', isDirectory: true, isSymlink: true }] : []
    )
    await runRestore('// file: [NEW] caf\u00e9/config\nx\n')
    expect(calls).toEqual([])
  })
})
