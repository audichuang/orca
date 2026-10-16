import { describe, expect, it } from 'vitest'
import { folderRepoSectionLabel } from './folder-section-label'

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
