import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { countHiddenFolderWorktrees, getFolderGitWorktrees } from './folder-git-worktrees'

function repo(id: string, path: string, extra: Partial<Repo> = {}): Repo {
  return { id, path, displayName: id, badgeColor: '', addedAt: 0, ...extra }
}

function worktree(id: string, repoId: string, path: string, isMainWorktree = true): Worktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only id, repoId, path and isMainWorktree.
  return { id, repoId, path, isMainWorktree } as Worktree
}

describe('getFolderGitWorktrees', () => {
  const repos = new Map(
    [
      repo('web', '/work/product/web'),
      repo('api', '/work/product/api'),
      repo('notes', '/work/product/notes', { kind: 'folder' }),
      repo('other', '/work/other'),
      repo('remote', '/work/product/remote', { connectionId: 'ssh-1' })
    ].map((r) => [r.id, r])
  )
  const folder = { folderPath: '/work/product', connectionId: null }

  it('lists git repo worktrees under the folder on its host, sorted by repo name', () => {
    const result = getFolderGitWorktrees(
      folder,
      [
        worktree('web-main', 'web', '/work/product/web'),
        worktree('api-main', 'api', '/work/product/api'),
        worktree('notes-main', 'notes', '/work/product/notes'),
        worktree('other-main', 'other', '/work/other'),
        worktree('remote-main', 'remote', '/work/product/remote')
      ],
      repos
    )
    expect(result.map((entry) => entry.worktree.id)).toEqual(['api-main', 'web-main'])
  })

  it('keeps linked worktrees inside the folder after the main one', () => {
    const result = getFolderGitWorktrees(
      folder,
      [
        worktree('web-feature', 'web', '/work/product/web-feature', false),
        worktree('web-main', 'web', '/work/product/web'),
        worktree('web-elsewhere', 'web', '/tmp/web-elsewhere', false)
      ],
      repos
    )
    expect(result.map((entry) => entry.worktree.id)).toEqual(['web-main', 'web-feature'])
  })

  it('matches repos on the same SSH host as a remote folder', () => {
    const result = getFolderGitWorktrees(
      { folderPath: '/work/product', connectionId: 'ssh-1' },
      [
        worktree('remote-main', 'remote', '/work/product/remote'),
        worktree('web-main', 'web', '/work/product/web')
      ],
      repos
    )
    expect(result.map((entry) => entry.worktree.id)).toEqual(['remote-main'])
  })

  it("separates a paired server's native repos from its nested SSH targets", () => {
    const server = 'runtime:env-1' as const
    const mixed = new Map(
      [
        repo('native', '/work/product/native', { executionHostId: server }),
        repo('ssh-a', '/work/product/a', { executionHostId: server, connectionId: 'ssh-a' }),
        repo('ssh-b', '/work/product/b', { executionHostId: server, connectionId: 'ssh-b' })
      ].map((r) => [r.id, r])
    )
    const wts = [
      worktree('native-main', 'native', '/work/product/native'),
      worktree('a-main', 'ssh-a', '/work/product/a'),
      worktree('b-main', 'ssh-b', '/work/product/b')
    ]
    const idsFor = (folderExtra: { connectionId?: string | null }): string[] =>
      getFolderGitWorktrees(
        {
          folderPath: '/work/product',
          executionHostId: server,
          connectionId: null,
          ...folderExtra
        },
        wts,
        mixed
      ).map((entry) => entry.worktree.id)
    expect(idsFor({})).toEqual(['native-main'])
    expect(idsFor({ connectionId: 'ssh-a' })).toEqual(['a-main'])
  })

  it('lists the repo that contains the folder and flags it', () => {
    const result = getFolderGitWorktrees(
      { folderPath: '/work/product/web/packages', connectionId: null },
      [
        worktree('web-main', 'web', '/work/product/web'),
        worktree('api-main', 'api', '/work/product/api')
      ],
      repos
    )
    expect(result).toEqual([expect.objectContaining({ containsFolder: true })])
    expect(result[0].worktree.id).toBe('web-main')
  })
})

describe('countHiddenFolderWorktrees', () => {
  const repos = new Map([
    ['web', repo('web', '/work/product/web')],
    ['other', repo('other', '/work/other')]
  ])
  const folder = { folderPath: '/work/product', connectionId: null }
  const detected = (paths: string[], visible: boolean) => ({
    repoId: 'x',
    authoritative: true,
    source: 'git' as const,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the counter reads only path, visible and ownership.
    worktrees: paths.map((path) => ({ path, visible, ownership: 'external' }) as never)
  })

  it('counts hidden linked worktrees under the folder only', () => {
    expect(
      countHiddenFolderWorktrees(
        folder,
        {
          web: detected(['/work/product/web-feature', '/work/elsewhere/wt'], false),
          other: detected(['/work/product/o'], false)
        },
        repos
      )
    ).toBe(2)
  })

  it('ignores visible worktrees', () => {
    expect(
      countHiddenFolderWorktrees(folder, { web: detected(['/work/product/web-f'], true) }, repos)
    ).toBe(0)
  })
})
