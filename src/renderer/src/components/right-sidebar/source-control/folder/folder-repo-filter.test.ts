import { describe, expect, it } from 'vitest'
import { filterFolderRepoIndexes } from './folder-repo-filter'

const LABELS = [
  'bfs-regression (develop)',
  'inv-svc-bfs (release/20261013)',
  'inv-web-console (main)'
]

describe('filterFolderRepoIndexes', () => {
  it('lists every repo for an empty query', () => {
    expect(filterFolderRepoIndexes(LABELS, '  ')).toEqual([0, 1, 2])
  })

  it('matches case-insensitively and requires every term', () => {
    expect(filterFolderRepoIndexes(LABELS, 'BFS')).toEqual([0, 1])
    expect(filterFolderRepoIndexes(LABELS, 'inv bfs')).toEqual([1])
  })

  it('matches the branch shown in the label', () => {
    expect(filterFolderRepoIndexes(LABELS, 'release')).toEqual([1])
  })
})
