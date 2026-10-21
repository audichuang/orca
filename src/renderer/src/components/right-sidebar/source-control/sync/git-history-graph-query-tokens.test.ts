import { afterEach, describe, expect, it } from 'vitest'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { parseGitHistoryGraphQuery } from './git-history-graph-filter'
import {
  collectGitHistoryAuthors,
  listGitHistoryAuthors,
  listRecentGitHistoryGraphPaths,
  readGitHistoryGraphQueryToken,
  rememberGitHistoryGraphPath,
  resetRecentGitHistoryGraphPathsForTest,
  setGitHistoryGraphQueryToken
} from './git-history-graph-query-tokens'

afterEach(() => resetRecentGitHistoryGraphPathsForTest())

describe('Git Graph query tokens', () => {
  it('reads the value the search parser will use, bare or quoted', () => {
    expect(readGitHistoryGraphQueryToken('fix author:ann', 'author')).toBe('ann')
    expect(readGitHistoryGraphQueryToken('path:"src/my file.ts" x', 'path')).toBe('src/my file.ts')
    expect(readGitHistoryGraphQueryToken('author:a AUTHOR:b', 'author')).toBe('b')
    expect(readGitHistoryGraphQueryToken('fix', 'author')).toBeNull()
    expect(readGitHistoryGraphQueryToken('author:""', 'author')).toBeNull()
  })

  it('replaces every token of the key and keeps free text and other tokens', () => {
    expect(setGitHistoryGraphQueryToken('fix author:a path:x author:b', 'author', 'Ada')).toBe(
      'fix path:x author:Ada'
    )
    expect(setGitHistoryGraphQueryToken('', 'author', 'Ada Lovelace')).toBe('author:"Ada Lovelace"')
    expect(setGitHistoryGraphQueryToken('fix  path:"a b"', 'path', null)).toBe('fix')
    expect(setGitHistoryGraphQueryToken('fix', 'path', '  ')).toBe('fix')
  })

  it('round-trips through the search parser', () => {
    const query = setGitHistoryGraphQueryToken(
      setGitHistoryGraphQueryToken('bug', 'author', 'Ada "the" Lovelace'),
      'path',
      'src/a b.ts'
    )
    expect(parseGitHistoryGraphQuery(query)).toEqual({
      text: 'bug',
      author: 'Ada the Lovelace',
      path: 'src/a b.ts'
    })
  })

  it('lists distinct loaded authors in order', () => {
    const item = (author?: string): GitHistoryItem => ({
      id: Math.random().toString(),
      parentIds: [],
      subject: '',
      message: '',
      timestamp: 1,
      author
    })
    expect(listGitHistoryAuthors([item('bo'), item('Ada'), item(), item('bo'), item(' ')])).toEqual(
      ['Ada', 'bo']
    )
  })

  it('keeps authors from earlier loads so a narrowed page still lists them', () => {
    const item = (author: string): GitHistoryItem => ({
      id: author,
      displayId: author,
      parentIds: [],
      subject: '',
      message: '',
      timestamp: 1,
      author
    })
    expect(collectGitHistoryAuthors('wt', [item('bo'), item('Ada')])).toEqual(['Ada', 'bo'])
    expect(collectGitHistoryAuthors('wt', [item('bo')])).toEqual(['Ada', 'bo'])
    expect(collectGitHistoryAuthors('other', [item('cy')])).toEqual(['cy'])
  })

  it('remembers recent paths per worktree, newest first, without duplicates', () => {
    rememberGitHistoryGraphPath('wt', 'a.ts')
    rememberGitHistoryGraphPath('wt', 'b.ts')
    rememberGitHistoryGraphPath('wt', 'a.ts')
    expect(listRecentGitHistoryGraphPaths('wt')).toEqual(['a.ts', 'b.ts'])
    expect(listRecentGitHistoryGraphPaths('other')).toEqual([])
  })
})
