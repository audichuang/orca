import { describe, expect, it } from 'vitest'
import {
  getRememberedFolderRepo,
  isFolderRepoListCollapsed,
  moveRepoSelection,
  rememberFolderRepoListCollapsed,
  rememberFolderRepo,
  resolveFolderDefaultRepo,
  resolveSelectedRepoId
} from './folder-repo-selection'

const ids = ['a', 'b', 'c']

describe('resolveSelectedRepoId', () => {
  it('prefers the explicit pick, even for a clean repo', () => {
    expect(resolveSelectedRepoId({ chosenId: 'c', defaultId: 'b', ids, firstDirtyId: 'a' })).toBe(
      'c'
    )
  })

  it('falls back to the frozen default, then first dirty, then first', () => {
    expect(resolveSelectedRepoId({ chosenId: null, defaultId: 'b', ids, firstDirtyId: 'a' })).toBe(
      'b'
    )
    expect(resolveSelectedRepoId({ chosenId: 'x', defaultId: 'y', ids, firstDirtyId: 'c' })).toBe(
      'c'
    )
    expect(
      resolveSelectedRepoId({ chosenId: null, defaultId: null, ids, firstDirtyId: undefined })
    ).toBe('a')
    expect(
      resolveSelectedRepoId({ chosenId: null, defaultId: null, ids: [], firstDirtyId: undefined })
    ).toBe('')
  })
})

describe('moveRepoSelection', () => {
  it('moves and clamps at the ends', () => {
    expect(moveRepoSelection(ids, 'a', 'ArrowDown')).toBe('b')
    expect(moveRepoSelection(ids, 'a', 'ArrowUp')).toBe('a')
    expect(moveRepoSelection(ids, 'c', 'ArrowDown')).toBe('c')
    expect(moveRepoSelection(ids, 'b', 'Home')).toBe('a')
    expect(moveRepoSelection(ids, 'b', 'End')).toBe('c')
  })
})

describe('remembered selection', () => {
  it('is kept per folder workspace', () => {
    rememberFolderRepo('folder:1', 'b')
    expect(getRememberedFolderRepo('folder:1')).toBe('b')
    expect(getRememberedFolderRepo('folder:2')).toBeNull()
  })

  it('remembers a fully collapsed list per folder workspace', () => {
    rememberFolderRepoListCollapsed('folder:1', true)
    expect(isFolderRepoListCollapsed('folder:1')).toBe(true)
    expect(isFolderRepoListCollapsed('folder:2')).toBe(false)
    rememberFolderRepoListCollapsed('folder:1', false)
    expect(isFolderRepoListCollapsed('folder:1')).toBe(false)
  })
})

describe('resolveFolderDefaultRepo', () => {
  it('waits for earlier repos before picking a later dirty one', () => {
    expect(resolveFolderDefaultRepo(ids, [undefined, undefined, 3])).toBeNull()
    expect(resolveFolderDefaultRepo(ids, [2, undefined, 3])).toBe('a')
    expect(resolveFolderDefaultRepo(ids, [0, 0, 3])).toBe('c')
  })

  it('falls back to the first repo once every repo is clean', () => {
    expect(resolveFolderDefaultRepo(ids, [0, 0, 0])).toBe('a')
    expect(resolveFolderDefaultRepo([], [])).toBeNull()
  })
})
