import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getGitHistoryGraphDraftQuery,
  getGitHistoryGraphFilter,
  parseGitHistoryGraphQuery,
  resetGitHistoryGraphFiltersForTest,
  setGitHistoryGraphDraftQuery,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'
import { showGitGraphPathHistory } from './git-history-graph-path-query'
import {
  listRecentGitHistoryGraphPaths,
  resetRecentGitHistoryGraphPathsForTest
} from './git-history-graph-query-tokens'

afterEach(() => {
  resetGitHistoryGraphFiltersForTest()
  resetRecentGitHistoryGraphPathsForTest()
})

function show(path: string, openGitGraphTab = vi.fn()): void {
  showGitGraphPathHistory({
    workspaceId: 'folder:f1',
    repoWorktreeId: 'repo-wt',
    path,
    openGitGraphTab
  })
}

describe('showGitGraphPathHistory', () => {
  it('filters the repo across all branches, syncs the draft, and opens the workspace tab', () => {
    updateGitHistoryGraphFilter('repo-wt', { scope: 'refs', refs: ['refs/heads/main'] })
    setGitHistoryGraphDraftQuery('repo-wt', 'author:ada')
    const openGitGraphTab = vi.fn()

    show('src/a.ts', openGitGraphTab)

    const filter = getGitHistoryGraphFilter('repo-wt')
    expect(filter).toMatchObject({ scope: 'all', refs: [], query: 'author:ada path:src/a.ts' })
    // Otherwise the toolbar's debounce would commit the stale draft back over it.
    expect(getGitHistoryGraphDraftQuery('repo-wt')).toBe(filter.query)
    expect(openGitGraphTab).toHaveBeenCalledWith('folder:f1', { repoWorktreeId: 'repo-wt' })
  })

  it('replaces an earlier path token and keeps author and free text', () => {
    setGitHistoryGraphDraftQuery('repo-wt', 'author:"Ada L" fix path:"old dir" bug')

    show('src/a.ts')

    expect(parseGitHistoryGraphQuery(getGitHistoryGraphFilter('repo-wt').query)).toEqual({
      text: 'fix bug',
      author: 'Ada L',
      path: 'src/a.ts'
    })
  })

  it('keeps a path with spaces whole and drops quotes the parser cannot escape', () => {
    show('docs/say "hi" now.md')

    expect(parseGitHistoryGraphQuery(getGitHistoryGraphFilter('repo-wt').query)).toEqual({
      path: 'docs/say hi now.md'
    })
  })

  it('adds the path to the Path picker recents', () => {
    show('src/a.ts')

    expect(listRecentGitHistoryGraphPaths('repo-wt')).toEqual(['src/a.ts'])
  })
})
