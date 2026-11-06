import type { GitHistoryGraphSavedFilter } from '../../../../../../shared/git-history-graph-query-types'

export type GitGraphTabSlice = {
  /** Fork: opens or focuses the workspace's Git Graph tab; null when no git repo resolves. */
  openGitGraphTab: (
    workspaceId: string,
    opts?: {
      repoWorktreeId?: string
      targetGroupId?: string
      revealCommit?: string
      /** Saved as the tab's filter, replacing the one it carries. */
      filter?: GitHistoryGraphSavedFilter
    }
  ) => string | null
  setGitGraphTabRepo: (fileId: string, repoWorktreeId: string) => void
  setGitGraphTabFilter: (fileId: string, filter: GitHistoryGraphSavedFilter) => void
}
