// Fork-only: in-memory branch filter and search per Commits graph (sidebar worktree or Git Graph tab).
import { useSyncExternalStore } from 'react'
import type {
  GitHistoryGraphRequest,
  GitHistoryGraphSavedFilter,
  GitHistoryGraphSearch
} from '../../../../../../shared/git-history-graph-query-types'

export type GitHistoryGraphFilter = GitHistoryGraphSavedFilter & {
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

// Why all branches and remotes: the tab has the whole editor width, where IntelliJ's log opens the same way.
export const GIT_GRAPH_TAB_DEFAULT_FILTER: GitHistoryGraphFilter = {
  ...DEFAULT_GIT_HISTORY_GRAPH_FILTER,
  scope: 'all',
  local: true,
  remotes: 'all'
}

const filters = new Map<string, GitHistoryGraphFilter>()
const listeners = new Set<() => void>()

// Why NUL: it cannot occur in a worktree id, so only tab keys carry it.
const TAB_KEY_SEPARATOR = '\0'

/**
 * The filter key of one repo shown in a Git Graph tab.
 * Why apart from the repo's worktree id: the sidebar Commits panel keys by that and keeps its own filter.
 */
export function gitGraphTabFilterKey(tabFileId: string, repoWorktreeId: string): string {
  return `${tabFileId}${TAB_KEY_SEPARATOR}${repoWorktreeId}`
}

export function isGitGraphTabFilterKeyOf(key: string, tabFileId: string): boolean {
  return key.startsWith(`${tabFileId}${TAB_KEY_SEPARATOR}`)
}

export function getDefaultGitHistoryGraphFilter(key: string | null): GitHistoryGraphFilter {
  return key?.includes(TAB_KEY_SEPARATOR)
    ? GIT_GRAPH_TAB_DEFAULT_FILTER
    : DEFAULT_GIT_HISTORY_GRAPH_FILTER
}

export function getGitHistoryGraphFilter(worktreeId: string | null): GitHistoryGraphFilter {
  return (worktreeId && filters.get(worktreeId)) || getDefaultGitHistoryGraphFilter(worktreeId)
}

/**
 * Makes `saved` the key's filter (and draft) unless it already is; silent, so it can run while rendering.
 * Why overwrite: the tab's saved filter moves on while another repo is shown, leaving this entry stale.
 */
export function seedGitHistoryGraphFilter(key: string, saved: GitHistoryGraphSavedFilter): void {
  const current = filters.get(key)
  const next = { ...saved, limit: GIT_HISTORY_GRAPH_PAGE_SIZE }
  if (
    current &&
    JSON.stringify(toSavedGitHistoryGraphFilter(current)) ===
      JSON.stringify(toSavedGitHistoryGraphFilter(next))
  ) {
    return
  }
  filters.set(key, next)
  draftQueries.delete(key)
}

export function toSavedGitHistoryGraphFilter(
  filter: GitHistoryGraphFilter
): GitHistoryGraphSavedFilter {
  const { scope, refs, local, remotes, tags, query } = filter
  return { scope, refs, local, remotes, ...(tags ? { tags } : {}), query }
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
      Boolean(next.tags) !== Boolean(previous.tags) ||
      next.refs !== previous.refs)
  ) {
    next.limit = GIT_HISTORY_GRAPH_PAGE_SIZE
  }
  filters.set(worktreeId, next)
  for (const listener of listeners) {
    listener()
  }
}

// Why keyed like the filter: every search box on one key shares a draft, so no debounce commits a stale copy.
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

/** Drops every filter and draft of a closed Git Graph tab. */
export function forgetGitGraphTabFilters(tabFileId: string): void {
  for (const map of [filters, draftQueries]) {
    for (const key of map.keys()) {
      if (isGitGraphTabFilterKeyOf(key, tabFileId)) {
        map.delete(key)
      }
    }
  }
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
    ...(filter.scope === 'all'
      ? {
          source: {
            local: filter.local,
            remotes: filter.remotes,
            ...(filter.tags ? { tags: true } : {})
          }
        }
      : {}),
    ...(filter.scope === 'refs' ? { refs: filter.refs } : {}),
    listTags: true,
    ...(hasSearch ? { search } : {}),
    limit: filter.limit
  }
}

/**
 * True when the user narrowed the graph past `key`'s default, so an empty result means "no
 * match", not "empty repo".
 */
export function isGitHistoryGraphFiltered(
  filter: GitHistoryGraphFilter,
  key: string | null = null
): boolean {
  const base = getDefaultGitHistoryGraphFilter(key)
  const sourcesChanged =
    filter.scope === 'all' &&
    (filter.local !== base.local ||
      JSON.stringify(filter.remotes) !== JSON.stringify(base.remotes) ||
      Boolean(filter.tags) !== Boolean(base.tags))
  return (
    filter.scope !== base.scope ||
    sourcesChanged ||
    hasGraphSearch(parseGitHistoryGraphQuery(filter.query))
  )
}

function hasGraphSearch(search: GitHistoryGraphSearch): boolean {
  return Object.keys(search).length > 0
}
