import { describe, expect, it } from 'vitest'
import { resolveCombinedDiffChangedSectionPath } from './combined-diff-external-change-path'

describe('resolveCombinedDiffChangedSectionPath', () => {
  it('maps a folder-relative watch event onto the repo diff section path', () => {
    expect(
      resolveCombinedDiffChangedSectionPath('/p/WebApp', {
        worktreePath: '/p',
        relativePath: 'WebApp/src/unstaged-mod.ts'
      })
    ).toBe('src/unstaged-mod.ts')
  })

  it('keeps a repo workspace event as is', () => {
    expect(
      resolveCombinedDiffChangedSectionPath('/p/WebApp', {
        worktreePath: '/p/WebApp',
        relativePath: 'src/a.ts'
      })
    ).toBe('src/a.ts')
  })

  it('ignores changes outside the diff repo', () => {
    expect(
      resolveCombinedDiffChangedSectionPath('/p/WebApp', {
        worktreePath: '/p',
        relativePath: 'api-server/server.ts'
      })
    ).toBeNull()
  })
})
