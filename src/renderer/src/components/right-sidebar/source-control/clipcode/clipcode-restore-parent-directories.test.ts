import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { createParentDirectoriesForNewFile } from './clipcode-restore-parent-directories'

const { createRuntimePath, statRuntimePath } = vi.hoisted(() => ({
  createRuntimePath: vi.fn(),
  statRuntimePath: vi.fn()
}))
// Why these modules: they are the runtime file clients upstream's tab-create-entry-action uses.
vi.mock('@/runtime/runtime-file-mutation-client', () => ({ createRuntimePath }))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({ statRuntimePath }))

const remote: RuntimeFileOperationArgs = {
  target: { kind: 'environment', environmentId: 'env-1' },
  worktreeId: 'wt-1',
  worktreePath: '/srv/repo'
}

function create(relativePath: string): Promise<void> {
  return createParentDirectoriesForNewFile({
    context: remote,
    relativePath,
    worktreePath: '/srv/repo'
  })
}

describe('createParentDirectoriesForNewFile', () => {
  beforeEach(() => {
    createRuntimePath.mockReset().mockResolvedValue(undefined)
    statRuntimePath.mockReset()
  })

  it('creates each parent one level at a time through the runtime client, with the remote context', async () => {
    await create('a/b/new.ts')

    expect(createRuntimePath.mock.calls).toEqual([
      [remote, '/srv/repo/a', 'directory'],
      [remote, '/srv/repo/a/b', 'directory']
    ])
  })

  it('treats an existing directory (EEXIST) as created and goes on', async () => {
    createRuntimePath.mockRejectedValueOnce(new Error('EEXIST: file already exists'))
    statRuntimePath.mockResolvedValue({ size: 0, isDirectory: true, mtime: 0 })

    await create('a/b/new.ts')

    expect(statRuntimePath).toHaveBeenCalledWith(remote, '/srv/repo/a')
    expect(createRuntimePath).toHaveBeenLastCalledWith(remote, '/srv/repo/a/b', 'directory')
  })

  it('refuses when an existing parent is not a directory', async () => {
    createRuntimePath.mockRejectedValueOnce(new Error('EEXIST'))
    statRuntimePath.mockResolvedValue({ size: 3, isDirectory: false, mtime: 0 })

    await expect(create('a/new.ts')).rejects.toThrow(
      'Cannot create file because /srv/repo/a is not a directory.'
    )
  })

  it('rethrows any other failure without probing', async () => {
    createRuntimePath.mockRejectedValueOnce(new Error('EACCES: permission denied'))

    await expect(create('a/new.ts')).rejects.toThrow('EACCES')
    expect(statRuntimePath).not.toHaveBeenCalled()
  })
})
