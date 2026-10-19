import { describe, expect, it } from 'vitest'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { computeBranchContainment } from './git-graph-branch-containment'

function commit(
  id: string,
  parentIds: string[],
  refs: { id: string; category: 'branches' | 'remote branches' | 'tags' }[] = []
): GitHistoryItem {
  return {
    id,
    parentIds,
    subject: id,
    message: id,
    references: refs.map((ref) => ({ ...ref, name: ref.id }))
  }
}

describe('computeBranchContainment', () => {
  it('propagates branch tips to every ancestor across a merge, ignoring tags', () => {
    // main: M -> C -> A ; feature: F -> A ; M merges F.
    const items = [
      commit('M', ['C', 'F'], [{ id: 'refs/heads/main', category: 'branches' }]),
      commit(
        'F',
        ['A'],
        [
          { id: 'refs/remotes/origin/feature', category: 'remote branches' },
          { id: 'refs/tags/v1', category: 'tags' }
        ]
      ),
      commit('C', ['A']),
      commit('A', [])
    ]
    const containment = computeBranchContainment(items)
    expect(containment.get('M')).toEqual(['refs/heads/main'])
    expect(containment.get('C')).toEqual(['refs/heads/main'])
    expect(containment.get('F')).toEqual(['refs/heads/main', 'refs/remotes/origin/feature'])
    expect(new Set(containment.get('A'))).toEqual(
      new Set(['refs/heads/main', 'refs/remotes/origin/feature'])
    )
  })

  it('leaves commits above every loaded tip uncontained', () => {
    const containment = computeBranchContainment([commit('X', ['Y']), commit('Y', [])])
    expect(containment.get('X')).toEqual([])
    expect(containment.get('Y')).toEqual([])
  })
})
