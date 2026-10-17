import { describe, expect, it, vi } from 'vitest'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'

const readRuntimeDirectory = vi.fn()
vi.mock('@/runtime/runtime-file-mutation-client', () => ({
  readRuntimeDirectory: (...args: unknown[]) => readRuntimeDirectory(...args)
}))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({
  isMissingRuntimePathError: (error: unknown) => String(error).includes('ENOENT')
}))

const { findRestorePathObstacle } = await import('./clipcode-restore-path-guard')
const context: RuntimeFileOperationArgs = { target: { kind: 'local' }, worktreeId: 'f', worktreePath: '/f' }

describe('findRestorePathObstacle', () => {
  it('reports a file used as a parent folder, but not a file at the leaf', async () => {
    readRuntimeDirectory.mockImplementation(async (_c: unknown, dir: string) =>
      dir === '/f' ? [{ name: 'README.md', isDirectory: false, isSymlink: false }] : []
    )
    expect(await findRestorePathObstacle(context, '/f', 'README.md/child.ts')).toBe('parentIsFile')
    expect(await findRestorePathObstacle(context, '/f', 'README.md')).toBeNull()
  })

  it('reports a symlink anywhere on the path', async () => {
    readRuntimeDirectory.mockImplementation(async (_c: unknown, dir: string) =>
      dir === '/f' ? [{ name: 'alias', isDirectory: true, isSymlink: true }] : []
    )
    expect(await findRestorePathObstacle(context, '/f', 'alias/config')).toBe('symlink')
  })
})
