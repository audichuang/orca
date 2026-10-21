import { describe, expect, it, vi } from 'vitest'
import {
  getRememberedFolderRepo,
  subscribeFolderRepoSelection,
  moveRepoSelection,
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

  it('notifies subscribers on a change only, so mirrored writes cannot loop', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeFolderRepoSelection(listener)
    rememberFolderRepo('folder:3', 'a')
    rememberFolderRepo('folder:3', 'a')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    rememberFolderRepo('folder:3', 'b')
    expect(listener).toHaveBeenCalledTimes(1)
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
