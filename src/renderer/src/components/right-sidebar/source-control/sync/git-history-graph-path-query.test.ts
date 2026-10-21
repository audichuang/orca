import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getGitHistoryGraphDraftQuery,
  getGitHistoryGraphFilter,
  gitGraphTabFilterKey,
  parseGitHistoryGraphQuery,
  resetGitHistoryGraphFiltersForTest,
  toGitHistoryGraphRequest,
  setGitHistoryGraphDraftQuery,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'
import { showGitGraphPathHistory } from './git-history-graph-path-query'
import {
  listRecentGitHistoryGraphPaths,
  resetRecentGitHistoryGraphPathsForTest
} from './git-history-graph-query-tokens'
import { buildGitGraphTabId } from '../../../git-graph-tab/git-graph-tab-model'

// Show File History always lands in the workspace's Git Graph tab, so it writes that tab's filter.
const tabKey = (): string => gitGraphTabFilterKey(buildGitGraphTabId('folder:f1'), 'repo-wt')

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
    updateGitHistoryGraphFilter(tabKey(), { scope: 'refs', refs: ['refs/heads/main'] })
    setGitHistoryGraphDraftQuery(tabKey(), 'author:ada')
    const openGitGraphTab = vi.fn()

    show('src/a.ts', openGitGraphTab)

    const filter = getGitHistoryGraphFilter(tabKey())
    expect(filter).toMatchObject({ scope: 'all', refs: [], query: 'author:ada path:src/a.ts' })
    // Otherwise the toolbar's debounce would commit the stale draft back over it.
    expect(getGitHistoryGraphDraftQuery(tabKey())).toBe(filter.query)
    expect(openGitGraphTab).toHaveBeenCalledWith('folder:f1', { repoWorktreeId: 'repo-wt' })
    // The sidebar Commits panel of the same repo is left alone.
    expect(getGitHistoryGraphFilter('repo-wt').scope).toBe('head')
  })

  it('replaces an earlier path token and keeps author and free text', () => {
    setGitHistoryGraphDraftQuery(tabKey(), 'author:"Ada L" fix path:"old dir" bug')

    show('src/a.ts')

    expect(parseGitHistoryGraphQuery(getGitHistoryGraphFilter(tabKey()).query)).toEqual({
      text: 'fix bug',
      author: 'Ada L',
      path: 'src/a.ts'
    })
  })

  it('keeps a path with spaces and quotes whole through the search parser', () => {
    show('docs/say "hi" now.md')

    expect(parseGitHistoryGraphQuery(getGitHistoryGraphFilter(tabKey()).query)).toEqual({
      path: 'docs/say "hi" now.md'
    })
  })

  it('includes remote branches so a remote-only file history stays visible', () => {
    updateGitHistoryGraphFilter(tabKey(), {
      scope: 'refs',
      refs: ['refs/remotes/origin/feature']
    })

    show('src/a.ts')

    const filter = getGitHistoryGraphFilter(tabKey())
    expect(filter).toMatchObject({ scope: 'all', local: true, remotes: 'all' })
    expect(toGitHistoryGraphRequest(filter)?.source).toEqual({ local: true, remotes: 'all' })
  })

  it('adds the path to the Path picker recents', () => {
    show('src/a.ts')

    expect(listRecentGitHistoryGraphPaths(tabKey())).toEqual(['src/a.ts'])
  })
})
