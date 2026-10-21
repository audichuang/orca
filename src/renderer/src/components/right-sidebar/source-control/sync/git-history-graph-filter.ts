// Fork-only: per-worktree branch filter and search for the Commits graph (in memory, like the repo accordion).
import { useSyncExternalStore } from 'react'
import type {
  GitHistoryGraphMode,
  GitHistoryGraphRequest,
  GitHistoryGraphSearch,
  GitHistoryGraphSource
} from '../../../../../../shared/git-history-graph-query-types'

export type GitHistoryGraphFilter = GitHistoryGraphSource & {
  scope: GitHistoryGraphMode
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

// Why shared: the sidebar and full-view search boxes are one draft, so neither debounce can commit a stale copy.
const draftQueries = new Map<string, string>()

export function getGitHistoryGraphDraftQuery(worktreeId: string): string {
  return draftQueries.get(worktreeId) ?? getGitHistoryGraphFilter(worktreeId).query
}

export function setGitHistoryGraphDraftQuery(worktreeId: string, query: string): void {
  draftQueries.set(worktreeId, query)
  for (const listener of listeners) {
    listener()
  }
}

export function useGitHistoryGraphDraftQuery(worktreeId: string): string {
  return useSyncExternalStore(subscribe, () => getGitHistoryGraphDraftQuery(worktreeId))
}

export function resetGitHistoryGraphFiltersForTest(): void {
  filters.clear()
  draftQueries.clear()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGitHistoryGraphFilter(worktreeId: string | null): GitHistoryGraphFilter {
  return useSyncExternalStore(subscribe, () => getGitHistoryGraphFilter(worktreeId))
}

export type GitHistoryGraphQuerySegment =
  | { kind: 'token'; key: 'author' | 'path'; value: string; raw: string }
  | { kind: 'text'; raw: string }

// Quoted values escape `"` and `\` with a backslash; a hand-typed trailing `\` falls back to a literal read.
const QUERY_TOKEN = /(author|path):(?:"((?:[^"\\]|\\.)*)"|"([^"]*)"|(\S+))/gi

/** The query as tokens and whitespace-free words, so callers can rewrite it without re-reading values. */
export function splitGitHistoryGraphQuery(query: string): GitHistoryGraphQuerySegment[] {
  const segments: GitHistoryGraphQuerySegment[] = []
  const pushText = (text: string): void => {
    for (const word of text.split(/\s+/)) {
      if (word) {
        segments.push({ kind: 'text', raw: word })
      }
    }
  }
  let end = 0
  for (const match of query.matchAll(QUERY_TOKEN)) {
    const start = match.index ?? end
    pushText(query.slice(end, start))
    const value =
      match[2] !== undefined ? match[2].replace(/\\(["\\])/g, '$1') : (match[3] ?? match[4] ?? '')
    segments.push({
      kind: 'token',
      key: match[1].toLowerCase() === 'author' ? 'author' : 'path',
      value: value.trim(),
      raw: match[0]
    })
    end = start + match[0].length
  }
  pushText(query.slice(end))
  return segments
}

export function parseGitHistoryGraphQuery(query: string): GitHistoryGraphSearch {
  const search: GitHistoryGraphSearch = {}
  const words: string[] = []
  for (const segment of splitGitHistoryGraphQuery(query)) {
    if (segment.kind === 'text') {
      words.push(segment.raw)
    } else if (segment.value) {
      search[segment.key] = segment.value
    }
  }
  const text = words.join(' ')
  return text ? { text, ...search } : search
}

/** The wire request, or undefined when the filter matches upstream's HEAD-only first page. */
export function toGitHistoryGraphRequest(
  filter: GitHistoryGraphFilter
): GitHistoryGraphRequest | undefined {
  const search = parseGitHistoryGraphQuery(filter.query)
  const hasSearch = hasGraphSearch(search)
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
  return filter.scope !== 'head' || hasGraphSearch(parseGitHistoryGraphQuery(filter.query))
}

function hasGraphSearch(search: GitHistoryGraphSearch): boolean {
  return Object.keys(search).length > 0
}
