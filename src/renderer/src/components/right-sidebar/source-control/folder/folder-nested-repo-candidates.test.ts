import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import {
  getNewNestedRepoCandidates,
  nestedRepoRelativeLabel
} from './folder-nested-repo-candidates'

function repo(id: string, path: string, extra: Partial<Repo> = {}): Repo {
  return { id, path, displayName: id, badgeColor: '', addedAt: 0, ...extra }
}

function candidate(path: string) {
  return { path, displayName: path.split('/').at(-1) ?? path, depth: 1 }
}

describe('getNewNestedRepoCandidates', () => {
  it('skips the folder itself, added repos and their linked worktrees on the same host', () => {
    const result = getNewNestedRepoCandidates({
      folderPath: '/work/cat/',
      folderOwner: { connectionId: null },
      scanned: [
        candidate('/work/cat'),
        candidate('/work/cat/docs/overseas'),
        candidate('/work/cat/docs'),
        candidate('/work/cat/docs/etf'),
        candidate('/work/cat/bfs'),
        candidate('/work/cat/web-feature')
      ],
      repos: [
        repo('bfs', '/work/cat/bfs'),
        repo('remote-etf', '/work/cat/docs/etf', { connectionId: 'ssh-1' }),
        repo('web', '/work/web')
      ],
      worktrees: [{ repoId: 'web', path: '/work/cat/web-feature' }]
    })

    expect(result.map((entry) => entry.path)).toEqual([
      '/work/cat/docs',
      '/work/cat/docs/etf',
      '/work/cat/docs/overseas'
    ])
  })
})

describe('nestedRepoRelativeLabel', () => {
  it('shows nested repos relative to the folder', () => {
    expect(nestedRepoRelativeLabel('/work/cat/', '/work/cat/docs/etf')).toBe('docs/etf')
    expect(nestedRepoRelativeLabel('C:\\work\\cat', 'C:\\work\\cat\\docs\\etf')).toBe('docs\\etf')
  })
})
