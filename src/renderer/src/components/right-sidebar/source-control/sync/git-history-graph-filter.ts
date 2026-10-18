// Fork-only: per-worktree branch filter and search for the Commits graph (in memory, like the repo accordion).
import { useSyncExternalStore } from 'react'
import type {
  GitHistoryGraphRequest,
  GitHistoryGraphSearch
} from '../../../../../../shared/git-history-graph-query-types'

export type GitHistoryGraphScope = 'head' | 'all' | 'refs'

export type GitHistoryGraphFilter = {
  scope: GitHistoryGraphScope
  local: boolean
  remotes: 'all' | string[]
  refs: string[]
  /** Raw search box text; `author:` and `path:` tokens narrow it. */
  query: string
  limit: number
}

export const GIT_HISTORY_GRAPH_PAGE_SIZE = 50

// Why local-only by default: every remote adds lanes, and the sidebar graph has a third of the window.
export const DEFAULT_GIT_HISTORY_GRAPH_FILTER: GitHistoryGraphFilter = {
  scope: 'head',
  local: true,
  remotes: [],
  refs: [],
  query: '',
  limit: GIT_HISTORY_GRAPH_PAGE_SIZE
}

const filters = new Map<string, GitHistoryGraphFilter>()
const listeners = new Set<() => void>()

export function getGitHistoryGraphFilter(worktreeId: string | null): GitHistoryGraphFilter {
  return (worktreeId && filters.get(worktreeId)) || DEFAULT_GIT_HISTORY_GRAPH_FILTER
}

export function updateGitHistoryGraphFilter(
  worktreeId: string,
  patch: Partial<GitHistoryGraphFilter>
): void {
  const previous = getGitHistoryGraphFilter(worktreeId)
  const next = { ...previous, ...patch }
  // Why: a new scope or search is a new list; keep "load more" depth only within one list.
  if (
    patch.limit === undefined &&
    (next.scope !== previous.scope ||
      next.query !== previous.query ||
      next.local !== previous.local ||
      next.remotes !== previous.remotes ||
      next.refs !== previous.refs)
  ) {
    next.limit = GIT_HISTORY_GRAPH_PAGE_SIZE
  }
  filters.set(worktreeId, next)
  for (const listener of listeners) {
    listener()
  }
}

export function resetGitHistoryGraphFiltersForTest(): void {
  filters.clear()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGitHistoryGraphFilter(worktreeId: string | null): GitHistoryGraphFilter {
  return useSyncExternalStore(subscribe, () => getGitHistoryGraphFilter(worktreeId))
}

const QUERY_TOKEN = /(author|path):(?:"([^"]*)"|(\S+))/gi

export function parseGitHistoryGraphQuery(query: string): GitHistoryGraphSearch {
  const search: GitHistoryGraphSearch = {}
  const text = query
    .replace(QUERY_TOKEN, (_match, key: string, quoted?: string, bare?: string) => {
      const value = (quoted ?? bare ?? '').trim()
      if (value) {
        search[key.toLowerCase() === 'author' ? 'author' : 'path'] = value
      }
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return text ? { text, ...search } : search
}

/** The wire request, or undefined when the filter matches upstream's HEAD-only first page. */
export function toGitHistoryGraphRequest(
  filter: GitHistoryGraphFilter
): GitHistoryGraphRequest | undefined {
  const search = parseGitHistoryGraphQuery(filter.query)
  const hasSearch = Object.keys(search).length > 0
  if (filter.scope === 'head' && !hasSearch && filter.limit <= GIT_HISTORY_GRAPH_PAGE_SIZE) {
    return undefined
  }
  return {
    mode: filter.scope,
    ...(filter.scope === 'all' ? { source: { local: filter.local, remotes: filter.remotes } } : {}),
    ...(filter.scope === 'refs' ? { refs: filter.refs } : {}),
    ...(hasSearch ? { search } : {}),
    limit: filter.limit
  }
}

/** True when the user narrowed the graph, so an empty result means "no match", not "empty repo". */
export function isGitHistoryGraphFiltered(filter: GitHistoryGraphFilter): boolean {
  return filter.scope !== 'head' || Object.keys(parseGitHistoryGraphQuery(filter.query)).length > 0
}
