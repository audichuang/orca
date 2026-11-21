// Fork-only: narrows the Git Graph to one path's history through its `path:` search token.
import { buildGitGraphTabId } from '../../../git-graph-tab/git-graph-tab-model'
import type { GitHistoryGraphSavedFilter } from '../../../../../../shared/git-history-graph-query-types'
import {
  getGitHistoryGraphDraftQuery,
  getGitHistoryGraphFilter,
  gitGraphTabFilterKey,
  toSavedGitHistoryGraphFilter,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'
import {
  applyGitHistoryGraphQuery,
  rememberGitHistoryGraphPath,
  setGitHistoryGraphQueryToken
} from './git-history-graph-query-tokens'

/** Filters the repo's graph to `path` across all branches and opens the workspace's Git Graph tab on it. */
export function showGitGraphPathHistory({
  workspaceId,
  repoWorktreeId,
  path,
  openGitGraphTab
}: {
  /** Workspace whose editor hosts the tab (the folder in a folder workspace). */
  workspaceId: string
  repoWorktreeId: string
  /** Repo-relative file or folder path. */
  path: string
  openGitGraphTab: (
    workspaceId: string,
    opts: { repoWorktreeId: string; filter: GitHistoryGraphSavedFilter }
  ) => unknown
}): void {
  // Why the tab's key: the history shows in the tab, and the sidebar Commits panel keeps its own filter.
  const key = gitGraphTabFilterKey(buildGitGraphTabId(workspaceId), repoWorktreeId)
  // Why the draft: it can hold typed text the debounce has not committed yet.
  const query = setGitHistoryGraphQueryToken(getGitHistoryGraphDraftQuery(key), 'path', path)
  // Why all branches and remotes: HEAD-only or local-only hides the file's commits elsewhere.
  updateGitHistoryGraphFilter(key, {
    scope: 'all',
    refs: [],
    local: true,
    remotes: 'all'
  })
  applyGitHistoryGraphQuery(key, query)
  rememberGitHistoryGraphPath(key, path)
  // Why pass the filter: the tab's mount restores its saved filter, which would drop the path otherwise.
  openGitGraphTab(workspaceId, {
    repoWorktreeId,
    filter: toSavedGitHistoryGraphFilter(getGitHistoryGraphFilter(key))
  })
}
