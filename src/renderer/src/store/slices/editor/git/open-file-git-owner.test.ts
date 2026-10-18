import { describe, expect, it } from 'vitest'
import type { AppState } from '../../../types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getOpenFileGitRelativePath } from './open-file-git-owner'

function worktree(id: string, repoId: string, path: string): Worktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the helper reads only id, hostId and path.
  return { id, repoId, path, hostId: 'local' } as Worktree
}

const state: Pick<AppState, 'worktreesByRepo'> = {
  worktreesByRepo: {
    web: [worktree('web-main', 'web', '/p/web')],
    outer: [worktree('outer-main', 'outer', '/repo')],
    win: [worktree('win-main', 'win', 'C:\\src\\app')]
  }
}

describe('getOpenFileGitRelativePath', () => {
  it('derives the repo-relative path for a repo inside the folder, whatever relativePath holds', () => {
    const file = {
      worktreeId: 'folder:f1',
      gitWorktreeId: 'web-main',
      filePath: '/p/web/src/a.ts',
      relativePath: 'web/src/a.ts'
    }
    expect(getOpenFileGitRelativePath(state, file)).toBe('src/a.ts')
  })

  it('prefixes the folder segment when the repo contains the folder', () => {
    const file = {
      worktreeId: 'folder:docs',
      gitWorktreeId: 'outer-main',
      filePath: '/repo/docs/n.md',
      relativePath: 'n.md'
    }
    expect(getOpenFileGitRelativePath(state, file)).toBe('docs/n.md')
  })

  it('uses forward slashes for a Windows repo, matching git status paths', () => {
    const file = {
      worktreeId: 'folder:f2',
      gitWorktreeId: 'win-main',
      filePath: 'C:\\src\\app\\lib\\x.ts',
      relativePath: 'app\\lib\\x.ts'
    }
    expect(getOpenFileGitRelativePath(state, file)).toBe('lib/x.ts')
  })

  it('falls back to relativePath when the file is outside the repo root or the repo is unknown', () => {
    const outside = {
      worktreeId: 'folder:f1',
      gitWorktreeId: 'web-main',
      filePath: '/p/other/a.ts',
      relativePath: 'other/a.ts'
    }
    expect(getOpenFileGitRelativePath(state, outside)).toBe('other/a.ts')
    expect(getOpenFileGitRelativePath(state, { ...outside, gitWorktreeId: 'gone' })).toBe(
      'other/a.ts'
    )
  })

  it('returns relativePath for a tab with no separate git owner', () => {
    const file = { worktreeId: 'web-main', filePath: '/p/web/src/a.ts', relativePath: 'src/a.ts' }
    expect(getOpenFileGitRelativePath(state, file)).toBe('src/a.ts')
    expect(getOpenFileGitRelativePath(state, { ...file, gitWorktreeId: 'web-main' })).toBe(
      'src/a.ts'
    )
  })
})
