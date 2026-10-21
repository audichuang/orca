import { describe, expect, it } from 'vitest'
import {
  folderRepoSectionBranch,
  folderRepoSectionLabel,
  folderRepoSectionName
} from './folder-section-label'

function member(repoId: string, name: string, path: string, branch: string) {
  return {
    repo: { id: repoId, displayName: name },
    worktree: { path, branch: `refs/heads/${branch}`, head: 'abc1234' }
  }
}

describe('folderRepoSectionLabel', () => {
  it('uses the repo name for a lone worktree', () => {
    const a = member('r1', 'WebApp', '/f/WebApp', 'main')
    expect(folderRepoSectionLabel(a, [a])).toBe('WebApp (main)')
  })

  it('uses the worktree folder name when a repo has several sections, preserving case', () => {
    const main = member('r1', 'WebApp', '/f/WebApp', 'main')
    const feature = member('r1', 'WebApp', '/f/WebApp-feature', 'feature/x')
    const all = [main, feature]
    expect(folderRepoSectionLabel(main, all)).toBe('WebApp (main)')
    expect(folderRepoSectionLabel(feature, all)).toBe('WebApp-feature (feature/x)')
  })

  it('adds the parent folder only when two titles would be identical', () => {
    const a = member('r1', 'WebApp', '/f/a/WebApp', 'main')
    const b = member('r1', 'WebApp', '/f/b/WebApp', 'dev')
    expect(folderRepoSectionLabel(a, [a, b])).toBe('a/WebApp (main)')
    expect(folderRepoSectionLabel(b, [a, b])).toBe('b/WebApp (dev)')
  })
})

describe('folderRepoSectionName / folderRepoSectionBranch', () => {
  it('splits the label into the row name and the branch column', () => {
    const a = member('r1', 'WebApp', '/f/a/WebApp', 'feature/x')
    const b = member('r1', 'WebApp', '/f/b/WebApp', 'dev')
    expect(folderRepoSectionName(a, [a, b])).toBe('a/WebApp')
    expect(folderRepoSectionBranch(a)).toBe('feature/x')
  })

  it('has no branch for a detached HEAD', () => {
    const detached = {
      repo: { id: 'r1', displayName: 'WebApp' },
      worktree: { path: '/f/WebApp', branch: '', head: 'abc1234' }
    }
    expect(folderRepoSectionName(detached, [detached])).toBe('WebApp')
    expect(folderRepoSectionBranch(detached)).toBeNull()
  })
})
