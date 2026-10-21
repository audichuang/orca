import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_GIT_HISTORY_GRAPH_FILTER,
  getGitHistoryGraphFilter,
  parseGitHistoryGraphQuery,
  resetGitHistoryGraphFiltersForTest,
  toGitHistoryGraphRequest,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'

afterEach(() => resetGitHistoryGraphFiltersForTest())

describe('parseGitHistoryGraphQuery', () => {
  it('splits author: and path: tokens from the message text', () => {
    expect(parseGitHistoryGraphQuery('fix login author:ann path:src/auth.ts')).toEqual({
      text: 'fix login',
      author: 'ann',
      path: 'src/auth.ts'
    })
  })

  it('keeps quoted values with spaces', () => {
    expect(parseGitHistoryGraphQuery('author:"Ann Lee" path:"docs/my file.md"')).toEqual({
      author: 'Ann Lee',
      path: 'docs/my file.md'
    })
  })

  it('reads a hand-typed quoted value ending in a backslash literally', () => {
    expect(parseGitHistoryGraphQuery('path:"src\\my dir\\" fix')).toEqual({
      path: 'src\\my dir\\',
      text: 'fix'
    })
  })

  it('still unescapes quoted values written with escapes', () => {
    expect(parseGitHistoryGraphQuery('path:"a \\"b\\" c\\\\" fix')).toEqual({
      path: 'a "b" c\\',
      text: 'fix'
    })
  })

  it('returns nothing for blank input', () => {
    expect(parseGitHistoryGraphQuery('   ')).toEqual({})
  })
})

describe('toGitHistoryGraphRequest', () => {
  it('sends nothing for the default filter so the host runs upstream history unchanged', () => {
    expect(toGitHistoryGraphRequest(DEFAULT_GIT_HISTORY_GRAPH_FILTER)).toBeUndefined()
  })

  it('keeps HEAD-only history when only the page size grew', () => {
    expect(toGitHistoryGraphRequest({ ...DEFAULT_GIT_HISTORY_GRAPH_FILTER, limit: 150 })).toEqual({
      mode: 'head',
      limit: 150
    })
  })

  it('builds an all-branches request with sources and search', () => {
    expect(
      toGitHistoryGraphRequest({
        ...DEFAULT_GIT_HISTORY_GRAPH_FILTER,
        scope: 'all',
        local: true,
        remotes: ['origin'],
        query: 'bug author:bob'
      })
    ).toEqual({
      mode: 'all',
      source: { local: true, remotes: ['origin'] },
      search: { text: 'bug', author: 'bob' },
      limit: 50
    })
  })

  it('builds a selected-branches request', () => {
    expect(
      toGitHistoryGraphRequest({
        ...DEFAULT_GIT_HISTORY_GRAPH_FILTER,
        scope: 'refs',
        refs: ['refs/heads/a']
      })
    ).toEqual({ mode: 'refs', refs: ['refs/heads/a'], limit: 50 })
  })
})

describe('per-worktree filter state', () => {
  it('keeps each worktree filter separate and resets the page size on a scope change', () => {
    updateGitHistoryGraphFilter('wt-a', { scope: 'all', limit: 300 })
    updateGitHistoryGraphFilter('wt-b', { query: 'x' })
    expect(getGitHistoryGraphFilter('wt-a')).toMatchObject({ scope: 'all', limit: 300 })
    expect(getGitHistoryGraphFilter('wt-b')).toMatchObject({ scope: 'head', query: 'x' })

    updateGitHistoryGraphFilter('wt-a', { scope: 'refs' })
    expect(getGitHistoryGraphFilter('wt-a').limit).toBe(DEFAULT_GIT_HISTORY_GRAPH_FILTER.limit)
  })
})
