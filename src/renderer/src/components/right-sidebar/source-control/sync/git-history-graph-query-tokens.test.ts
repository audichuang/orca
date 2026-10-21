import { afterEach, describe, expect, it } from 'vitest'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { parseGitHistoryGraphQuery } from './git-history-graph-filter'
import {
  collectGitHistoryAuthors,
  listGitHistoryAuthors,
  listRecentGitHistoryGraphPaths,
  mergeGitHistoryGraphFreeText,
  readGitHistoryGraphQueryToken,
  rememberGitHistoryGraphPath,
  resetRecentGitHistoryGraphPathsForTest,
  setGitHistoryGraphQueryToken,
  stripGitHistoryGraphQueryTokens
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
      author: 'Ada "the" Lovelace',
      path: 'src/a b.ts'
    })
  })

  it('keeps other quoted values verbatim when setting a token', () => {
    const query = setGitHistoryGraphQueryToken('path:"docs/two  spaces.md"', 'author', 'Ada')
    expect(query).toBe('path:"docs/two  spaces.md" author:Ada')
    expect(readGitHistoryGraphQueryToken(query, 'path')).toBe('docs/two  spaces.md')
    expect(parseGitHistoryGraphQuery(query).path).toBe('docs/two  spaces.md')
  })

  it('escapes quotes and backslashes in quoted values', () => {
    const value = 'dir/a\\"b c.md'
    const query = setGitHistoryGraphQueryToken('fix', 'path', value)
    expect(readGitHistoryGraphQueryToken(query, 'path')).toBe(value)
    expect(parseGitHistoryGraphQuery(query)).toEqual({ text: 'fix', path: value })
    expect(parseGitHistoryGraphQuery('path:"a\\"b\\\\c"')).toEqual({ path: 'a"b\\c' })
    expect(setGitHistoryGraphQueryToken('', 'path', 'a\\b')).toBe('path:a\\b')
    expect(parseGitHistoryGraphQuery('path:a\\b')).toEqual({ path: 'a\\b' })
  })

  it('finds tokens where the search parser does, keeping other keys as typed', () => {
    expect(setGitHistoryGraphQueryToken('fix  AUTHOR:"b  c"  y', 'path', 'p')).toBe(
      'fix AUTHOR:"b  c" y path:p'
    )
    expect(readGitHistoryGraphQueryToken('xauthor:a', 'author')).toBe('a')
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

  it('shows only free text in the full-view box and keeps button tokens while typing', () => {
    const query = 'fix author:ann path:"src/a b.ts"'
    expect(stripGitHistoryGraphQueryTokens(query)).toBe('fix')
    expect(mergeGitHistoryGraphFreeText(query, 'fix', 'fix bug')).toBe(
      'fix bug author:ann path:"src/a b.ts"'
    )
    // A token typed in the box wins over the button's, and deleting it from the box removes it.
    expect(mergeGitHistoryGraphFreeText('author:ann', '', 'author:bo')).toBe('author:bo')
    expect(mergeGitHistoryGraphFreeText('author:bo', 'author:bo', '')).toBe('')
  })
})
