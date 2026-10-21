// Fork-only: narrows the Git Graph to one path's history through its `path:` search token.
import {
  getGitHistoryGraphDraftQuery,
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
  openGitGraphTab: (workspaceId: string, opts: { repoWorktreeId: string }) => unknown
}): void {
  // Why the draft: it can hold typed text the debounce has not committed yet.
  const query = setGitHistoryGraphQueryToken(
    getGitHistoryGraphDraftQuery(repoWorktreeId),
    'path',
    path
  )
  // Why all branches and remotes: HEAD-only or local-only hides the file's commits elsewhere.
  updateGitHistoryGraphFilter(repoWorktreeId, {
    scope: 'all',
    refs: [],
    local: true,
    remotes: 'all'
  })
  applyGitHistoryGraphQuery(repoWorktreeId, query)
  rememberGitHistoryGraphPath(repoWorktreeId, path)
  openGitGraphTab(workspaceId, { repoWorktreeId })
}
