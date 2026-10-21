import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_GIT_HISTORY_GRAPH_FILTER,
  getGitHistoryGraphFilter,
  gitGraphTabFilterKey,
  isGitHistoryGraphFiltered,
  parseGitHistoryGraphQuery,
  seedGitHistoryGraphFilter,
  resetGitHistoryGraphFiltersForTest,
  toGitHistoryGraphRequest,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'
import { resetGitHistoryGraphFilterToDefault } from './git-history-graph-query-tokens'

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

describe('Git Graph tab filter', () => {
  it('defaults to all branches and stays apart from the sidebar filter of the same repo', () => {
    const tabKey = gitGraphTabFilterKey('ws::git-graph', 'wt-a')
    expect(getGitHistoryGraphFilter(tabKey)).toMatchObject({
      scope: 'all',
      local: true,
      remotes: 'all'
    })
    expect(getGitHistoryGraphFilter('wt-a').scope).toBe('head')

    updateGitHistoryGraphFilter(tabKey, { query: 'fix' })
    updateGitHistoryGraphFilter('wt-a', { scope: 'refs', refs: ['refs/heads/x'] })
    expect(getGitHistoryGraphFilter('wt-a')).toMatchObject({ scope: 'refs', query: '' })
    expect(getGitHistoryGraphFilter(tabKey)).toMatchObject({ scope: 'all', refs: [], query: 'fix' })
  })

  it("measures 'filtered' and Clear against the tab's own default", () => {
    const tabKey = gitGraphTabFilterKey('ws::git-graph', 'wt-a')
    expect(isGitHistoryGraphFiltered(getGitHistoryGraphFilter(tabKey), tabKey)).toBe(false)
    updateGitHistoryGraphFilter(tabKey, { scope: 'head' })
    expect(isGitHistoryGraphFiltered(getGitHistoryGraphFilter(tabKey), tabKey)).toBe(true)

    resetGitHistoryGraphFilterToDefault(tabKey)
    expect(getGitHistoryGraphFilter(tabKey)).toMatchObject({ scope: 'all', remotes: 'all' })
    // The sidebar keeps upstream's HEAD-only default as unfiltered.
    expect(isGitHistoryGraphFiltered(getGitHistoryGraphFilter('wt-a'), 'wt-a')).toBe(false)
    updateGitHistoryGraphFilter('wt-a', { scope: 'all' })
    expect(isGitHistoryGraphFiltered(getGitHistoryGraphFilter('wt-a'), 'wt-a')).toBe(true)
  })

  it('seeds a saved filter only when the key has none yet', () => {
    const tabKey = gitGraphTabFilterKey('ws::git-graph', 'wt-a')
    const saved = { scope: 'head' as const, refs: [], local: true, remotes: [], query: 'fix' }
    seedGitHistoryGraphFilter(tabKey, saved)
    expect(getGitHistoryGraphFilter(tabKey)).toMatchObject({ ...saved, limit: 50 })

    seedGitHistoryGraphFilter(tabKey, { ...saved, query: 'other' })
    expect(getGitHistoryGraphFilter(tabKey).query).toBe('fix')
  })
})
