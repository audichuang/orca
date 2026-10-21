import { describe, expect, it } from 'vitest'
import {
  buildFolderRepoListItems,
  getFolderRepoExpandedGroups,
  toggleFolderRepoGroup
} from './folder-repo-groups'

const base = {
  visibleIndexes: [0, 1, 2, 3],
  changeCounts: [0, 3, undefined, 0],
  pendingSync: [false, false, false, false],
  filtering: false,
  expandedGroups: new Set(['changes'] as const),
  selectedIndex: 1
}

describe('buildFolderRepoListItems', () => {
  it('puts dirty and still-loading repos first and folds the clean group', () => {
    expect(buildFolderRepoListItems(base)).toEqual([
      { kind: 'group', group: 'changes', count: 2, expanded: true },
      { kind: 'repo', index: 1 },
      { kind: 'repo', index: 2 },
      { kind: 'group', group: 'clean', count: 2, expanded: false }
    ])
  })

  it('keeps the selected repo visible inside a folded group', () => {
    const items = buildFolderRepoListItems({ ...base, selectedIndex: 3 })
    expect(items.at(-1)).toEqual({ kind: 'repo', index: 3 })
  })

  it('lists filter matches flat with no group headers', () => {
    const items = buildFolderRepoListItems({ ...base, filtering: true, visibleIndexes: [0, 3] })
    expect(items).toEqual([
      { kind: 'repo', index: 0 },
      { kind: 'repo', index: 3 }
    ])
  })

  it('puts a clean repo with commits to push or pull under Changes', () => {
    const items = buildFolderRepoListItems({ ...base, pendingSync: [false, false, false, true] })
    expect(items.slice(0, 4)).toEqual([
      { kind: 'group', group: 'changes', count: 3, expanded: true },
      { kind: 'repo', index: 1 },
      { kind: 'repo', index: 2 },
      { kind: 'repo', index: 3 }
    ])
  })

  it('omits a group with no repos', () => {
    const items = buildFolderRepoListItems({ ...base, changeCounts: [0, 0, 0, 0] })
    expect(items.filter((item) => item.kind === 'group')).toHaveLength(1)
  })
})

describe('folder repo group expansion', () => {
  it('starts with Changes open and remembers toggles per folder', () => {
    expect([...getFolderRepoExpandedGroups('folder:a')]).toEqual(['changes'])
    toggleFolderRepoGroup('folder:a', 'clean')
    expect(getFolderRepoExpandedGroups('folder:a').has('clean')).toBe(true)
    expect(getFolderRepoExpandedGroups('folder:b').has('clean')).toBe(false)
  })
})
