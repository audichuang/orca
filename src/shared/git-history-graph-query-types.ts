// Fork-only: the branch-graph extension of git history (all branches, branch filter, git-side search).

export const GIT_HISTORY_GRAPH_MODES = ['head', 'all', 'refs'] as const
/** Which history the graph walks; `head` keeps upstream's current-branch-only history. */
export type GitHistoryGraphMode = (typeof GIT_HISTORY_GRAPH_MODES)[number]

export type GitHistoryGraphSource = {
  local: boolean
  remotes: 'all' | string[]
}

export type GitHistoryGraphSearch = {
  /** Case-insensitive literal match on the commit message. */
  text?: string
  /** Case-insensitive literal match on author name or email. */
  author?: string
  /** Repo-relative path the commit must touch. */
  path?: string
}

export type GitHistoryGraphRequest = {
  mode: GitHistoryGraphMode
  /** Used when mode is `all`. */
  source?: GitHistoryGraphSource
  /** Full ref names (`refs/heads/…`, `refs/remotes/…`) used when mode is `refs`. */
  refs?: string[]
  search?: GitHistoryGraphSearch
  /** Overrides the upstream 200-commit cap; old hosts ignore it with the rest of `graph`. */
  limit?: number
}

export type GitHistoryGraphRefOption = {
  fullName: string
  name: string
  category: 'branches' | 'remote branches'
  remote?: string
}

/** Echoed only by hosts that understand `graph`; its absence means the host returned plain history. */
export type GitHistoryGraphApplied = {
  mode: GitHistoryGraphMode
  refs: GitHistoryGraphRefOption[]
  remotes: string[]
  limit: number
}

export const GIT_HISTORY_GRAPH_MAX_LIMIT = 1000
export const GIT_HISTORY_GRAPH_REF_LIST_LIMIT = 500
