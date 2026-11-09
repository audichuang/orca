import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getFolderGitWorktrees } from './folder-git-worktrees'

function nestedSshRepo(): Repo {
  return {
    id: 'nested',
    path: '/work/product/nested',
    displayName: 'nested',
    badgeColor: '',
    addedAt: 0,
    executionHostId: 'runtime:hub',
    connectionId: 'box'
  }
}

function worktree(extra: Partial<Worktree>): Worktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only id, repoId, path, isMainWorktree and the host owner fields.
  return {
    id: 'nested-main',
    repoId: 'nested',
    path: '/work/product/nested',
    isMainWorktree: true,
    ...extra
  } as Worktree
}

describe('getFolderGitWorktrees on a paired hub with a nested SSH repo', () => {
  const folder = {
    folderPath: '/work/product',
    executionHostId: 'runtime:hub' as const,
    connectionId: 'box'
  }

  it('keeps an in-folder worktree whose host is the SSH target behind the hub', () => {
    const result = getFolderGitWorktrees(
      folder,
      [worktree({ hostId: 'ssh:box', runtimeOwnerEnvironmentId: 'hub' })],
      [nestedSshRepo()]
    )
    expect(result.map((entry) => entry.worktree.id)).toEqual(['nested-main'])
  })

  it('does not pull a direct-SSH worktree into the hub folder when both repos share one id', () => {
    const direct: Repo = { ...nestedSshRepo(), executionHostId: undefined }
    const result = getFolderGitWorktrees(
      folder,
      [worktree({ id: 'direct-wt', hostId: 'ssh:box' })],
      [direct, nestedSshRepo()]
    )
    expect(result).toEqual([])
  })
})
