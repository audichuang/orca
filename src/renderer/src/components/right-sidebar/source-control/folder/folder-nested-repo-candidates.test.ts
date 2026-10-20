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
      folderPath: '/work/folder/',
      folderOwner: { connectionId: null },
      scanned: [
        candidate('/work/folder'),
        candidate('/work/folder/docs/guide'),
        candidate('/work/folder/docs'),
        candidate('/work/folder/docs/remote-only'),
        candidate('/work/folder/added'),
        candidate('/work/folder/web-feature')
      ],
      repos: [
        repo('added', '/work/folder/added'),
        repo('remote-only', '/work/folder/docs/remote-only', { connectionId: 'ssh-1' }),
        repo('web', '/work/web')
      ],
      worktrees: [{ repoId: 'web', path: '/work/folder/web-feature' }]
    })

    expect(result.map((entry) => entry.path)).toEqual([
      '/work/folder/docs',
      '/work/folder/docs/guide',
      '/work/folder/docs/remote-only'
    ])
  })
})

describe('nestedRepoRelativeLabel', () => {
  it('shows nested repos relative to the folder', () => {
    expect(nestedRepoRelativeLabel('/work/folder/', '/work/folder/docs/guide')).toBe('docs/guide')
    expect(nestedRepoRelativeLabel('C:\\work\\folder', 'C:\\work\\folder\\docs\\guide')).toBe(
      'docs\\guide'
    )
  })
})
