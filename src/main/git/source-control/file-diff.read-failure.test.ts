import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./git-blob-read', () => ({
  readGitBlobAtIndexPath: vi.fn(() => Promise.reject(new Error('spawn failed'))),
  readGitBlobAtOidPath: vi.fn(() => Promise.reject(new Error('spawn failed'))),
  readUnstagedLeftBlob: vi.fn(() => Promise.reject(new Error('spawn failed'))),
  readWorkingTreeFile: vi.fn(() => Promise.reject(new Error('spawn failed')))
}))
vi.mock('./worktree-diff-stamp', () => ({ readWorktreeDiffStamp: vi.fn(async () => null) }))
vi.mock(import('./submodule-paths'), async (importOriginal) => ({
  ...(await importOriginal()),
  findContainingSubmodule: vi.fn(() => null),
  listSubmodulePaths: vi.fn(async () => [])
}))

import { getDiff } from './file-diff'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'

describe('getDiff when a blob read throws', () => {
  beforeEach(() => invalidateGitReadCaches())

  it.each([true, false])('marks both sides missing (staged=%s)', async (staged) => {
    const result = await getDiff('/repo', 'file.txt', staged)
    expect(result).toMatchObject({ originalContent: '', modifiedContent: '' })
    expect(result.missingSides).toEqual(['original', 'modified'])
  })
})
