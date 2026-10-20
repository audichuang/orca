import { describe, expect, it } from 'vitest'
import { filterFolderRepoIndexes } from './folder-repo-filter'

const LABELS = ['payments-api (develop)', 'orders-api (release/1.2)', 'orders-web (main)']

describe('filterFolderRepoIndexes', () => {
  it('lists every repo for an empty query', () => {
    expect(filterFolderRepoIndexes(LABELS, '  ')).toEqual([0, 1, 2])
  })

  it('matches case-insensitively and requires every term', () => {
    expect(filterFolderRepoIndexes(LABELS, 'API')).toEqual([0, 1])
    expect(filterFolderRepoIndexes(LABELS, 'orders api')).toEqual([1])
  })

  it('matches the branch shown in the label', () => {
    expect(filterFolderRepoIndexes(LABELS, 'release')).toEqual([1])
  })
})
