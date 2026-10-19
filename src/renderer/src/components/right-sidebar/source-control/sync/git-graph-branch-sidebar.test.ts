import { describe, expect, it } from 'vitest'
import type { GitHistoryResult } from '../../../../../../shared/git-history'
import { buildBranchTreeSections } from './git-graph-branch-sidebar'

const base: Omit<GitHistoryResult, 'items'> = {
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: false,
  limit: 50
}

describe('buildBranchTreeSections', () => {
  it('falls back to commit decorations when HEAD-only history carries no ref list', () => {
    const result: GitHistoryResult = {
      ...base,
      items: [
        {
          id: 'c1',
          parentIds: [],
          subject: 's',
          message: 's',
          references: [
            { id: 'refs/heads/main', name: 'main', category: 'branches' },
            { id: 'refs/remotes/origin/main', name: 'origin/main', category: 'remote branches' },
            { id: 'refs/tags/v1', name: 'v1', category: 'tags' }
          ]
        }
      ]
    }
    const sections = buildBranchTreeSections(result, null)
    expect(sections.map((section) => [section.label, section.entries.map((e) => e.name)])).toEqual([
      ['Local', ['main']],
      ['origin', ['origin/main']],
      ['Tags', ['v1']]
    ])
    expect(sections[0]!.entries[0]!.tipId).toBe('c1')
  })

  it('lists fetched branches whose tips are not loaded, without duplicating decorated ones', () => {
    const result: GitHistoryResult = {
      ...base,
      items: [
        {
          id: 'c1',
          parentIds: [],
          subject: 's',
          message: 's',
          references: [{ id: 'refs/heads/main', name: 'main', category: 'branches' }]
        }
      ]
    }
    const sections = buildBranchTreeSections(result, [
      { fullName: 'refs/heads/main', name: 'main', category: 'branches' },
      { fullName: 'refs/heads/old', name: 'old', category: 'branches' }
    ])
    expect(sections[0]!.entries).toEqual([
      { id: 'refs/heads/main', name: 'main', tipId: 'c1' },
      { id: 'refs/heads/old', name: 'old', tipId: undefined }
    ])
  })
})
