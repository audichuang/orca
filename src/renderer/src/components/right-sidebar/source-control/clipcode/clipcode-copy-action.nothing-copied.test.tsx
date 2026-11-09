// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirEntry } from '../../../../../../shared/file-listing/directory-entry'
import { copyClipcodeCommitChanges, copyClipcodeExplorerTargets } from './clipcode-copy-action'
import type { ClipcodeExplorerTarget } from './clipcode-explorer-copy'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), dismiss: vi.fn() }
}))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))

const fsMocks = vi.hoisted(() => ({
  readDir: vi.fn(),
  readBytes: vi.fn(),
  denied: async () => {
    throw new Error('EACCES: permission denied')
  }
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ activeWorktreeId: 'wt', settings: {} }) }
}))
vi.mock('../../file-explorer/navigation/file-explorer-operation-owner', () => ({
  getFileExplorerOperationOwner: () => ({ kind: 'local' }),
  getFileExplorerOperationRoute: () => ({ target: { kind: 'local' } }),
  getFileExplorerOwnerUnresolvedMessage: () => 'unresolved'
}))
vi.mock('@/runtime/files/reads/runtime-directory-read', () => ({
  readRuntimeDirectory: (_context: unknown, path: string) => fsMocks.readDir(path)
}))
vi.mock('@/runtime/files/reads/runtime-paged-file-read', () => ({
  readRuntimeFileBytes: fsMocks.readBytes
}))
vi.mock('@/runtime/files/reads/runtime-file-read-client', () => ({
  readRuntimeFileContent: fsMocks.denied
}))

const writeClipboardText = vi.fn()
const commitDiff = vi.fn(async () => {
  throw new Error('fatal: bad object')
})

beforeEach(() => {
  fsMocks.readBytes.mockImplementation(fsMocks.denied)
  Object.assign(window, { api: { ui: { writeClipboardText }, git: { commitDiff } } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Copy Full Source when everything selected is skipped', () => {
  it('leaves the clipboard alone and names the skipped files, one category per line', async () => {
    await copyClipcodeCommitChanges({
      rootPath: '/repo',
      context: { target: { kind: 'local' }, worktreeId: 'wt', worktreePath: '/repo' },
      loadCommits: async () => [
        {
          commitOid: 'a'.repeat(40),
          parentOids: ['1'.repeat(40)],
          entries: [
            { path: 'gone.ts', status: 'modified' },
            { path: 'a:b.png', status: 'added' }
          ]
        }
      ]
    })

    expect(writeClipboardText).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledTimes(1)
    const [title, options] = vi.mocked(toast.warning).mock.calls[0]
    expect(title).toBe('Nothing to copy')
    const description = options?.description
    const { container } = render(
      <>{typeof description === 'function' ? description() : description}</>
    )
    expect([...container.querySelectorAll('p')].map((line) => line.textContent)).toEqual([
      'Unreadable: 1 · gone.ts',
      'Name not portable: 1 · a:b.png'
    ])
  })
})

const file = (name: string): DirEntry => ({ name, isDirectory: false, isSymlink: false })

describe('Copy to Clipboard when every selected file is skipped', () => {
  it.each<[string, ClipcodeExplorerTarget, string]>([
    [
      'a folder holding only a mode-000 file',
      { path: '/ws/locked', isDirectory: true },
      'Unreadable: 1 · locked/secret.txt'
    ],
    [
      'a folder holding only q"uote.txt',
      { path: '/ws/quoted', isDirectory: true },
      'Name not portable: 1 · quoted/q"uote.txt'
    ],
    [
      'a lone unreadable folder',
      { path: '/ws/closed', isDirectory: true },
      'Unreadable: 1 · closed'
    ],
    [
      'a lone symlinked folder',
      { path: '/ws/linked', isDirectory: true, isSymlink: true },
      'Symlinked folder: 1 · linked'
    ]
  ])('%s: leaves the clipboard alone and names it', async (_name, target, line) => {
    fsMocks.readDir.mockImplementation(async (path: string) => {
      const listings: Record<string, DirEntry[]> = {
        '/ws/locked': [file('secret.txt')],
        '/ws/quoted': [file('q"uote.txt')]
      }
      if (!listings[path]) {
        throw new Error('EACCES: permission denied')
      }
      return listings[path]
    })

    await copyClipcodeExplorerTargets({ worktreePath: '/ws', targets: [target] })

    expect(writeClipboardText).not.toHaveBeenCalled()
    const [title, options] = vi.mocked(toast.warning).mock.calls[0]
    expect(title).toBe('Nothing to copy')
    const description = options?.description
    const { container } = render(
      <>{typeof description === 'function' ? description() : description}</>
    )
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual([line])
  })
})

describe('Copy to Clipboard when only size placeholders would be copied', () => {
  it('leaves the clipboard alone and says the file was over the size limit', async () => {
    fsMocks.readBytes.mockResolvedValue({ kind: 'too_large', size: 3145728 })

    await copyClipcodeExplorerTargets({
      worktreePath: '/ws',
      targets: [{ path: '/ws/big.txt', isDirectory: false }]
    })

    expect(writeClipboardText).not.toHaveBeenCalled()
    const [title, options] = vi.mocked(toast.warning).mock.calls[0]
    expect(title).toBe('Nothing to copy')
    const description = options?.description
    const { container } = render(
      <>{typeof description === 'function' ? description() : description}</>
    )
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      '(1 skipped: size exceeded)'
    ])
  })
})
