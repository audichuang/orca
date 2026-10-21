// Fork-only: reads and rewrites the `author:` / `path:` tokens of the Git Graph search query.
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import {
  DEFAULT_GIT_HISTORY_GRAPH_FILTER,
  setGitHistoryGraphDraftQuery,
  splitGitHistoryGraphQuery,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'

export type GitHistoryGraphQueryTokenKey = 'author' | 'path'

/** The value the search will use for `key` (the parser keeps the last one), or null. */
export function readGitHistoryGraphQueryToken(
  query: string,
  key: GitHistoryGraphQueryTokenKey
): string | null {
  let value: string | null = null
  for (const segment of splitGitHistoryGraphQuery(query)) {
    if (segment.kind === 'token' && segment.key === key && segment.value) {
      value = segment.value
    }
  }
  return value
}

/** `query` with every `key` token dropped, then one for `value` appended unless it is empty. */
export function setGitHistoryGraphQueryToken(
  query: string,
  key: GitHistoryGraphQueryTokenKey,
  value: string | null
): string {
  // Why raw: re-serializing the other tokens would rewrite what the user typed.
  const rest = splitGitHistoryGraphQuery(query)
    .filter((segment) => segment.kind === 'text' || segment.key !== key)
    .map((segment) => segment.raw)
  const clean = value?.trim() ?? ''
  if (clean) {
    rest.push(
      /[\s"]/.test(clean) ? `${key}:"${clean.replace(/["\\]/g, '\\$&')}"` : `${key}:${clean}`
    )
  }
  return rest.join(' ')
}

/** Commits the query at once; the draft too, or the search box debounce would write the old text back. */
export function applyGitHistoryGraphQuery(worktreeId: string, query: string): void {
  updateGitHistoryGraphFilter(worktreeId, { query })
  setGitHistoryGraphDraftQuery(worktreeId, query)
}

export function resetGitHistoryGraphFilterToDefault(worktreeId: string): void {
  updateGitHistoryGraphFilter(worktreeId, { ...DEFAULT_GIT_HISTORY_GRAPH_FILTER })
  setGitHistoryGraphDraftQuery(worktreeId, '')
}

/** Distinct authors of the loaded commits, for the User picker. */
export function listGitHistoryAuthors(items: readonly GitHistoryItem[]): string[] {
  const authors = new Set<string>()
  for (const item of items) {
    const author = item.author?.trim()
    if (author) {
      authors.add(author)
    }
  }
  return [...authors].sort((a, b) => a.localeCompare(b))
}

const seenAuthors = new Map<string, Set<string>>()

/**
 * Authors of `items` plus every author this worktree's graph has loaded this session.
 * Why remember: an author or path filter narrows the page, which would hide the other authors to switch to.
 */
export function collectGitHistoryAuthors(
  worktreeId: string,
  items: readonly GitHistoryItem[]
): string[] {
  const seen = seenAuthors.get(worktreeId) ?? new Set<string>()
  for (const author of listGitHistoryAuthors(items)) {
    seen.add(author)
  }
  seenAuthors.set(worktreeId, seen)
  return [...seen].sort((a, b) => a.localeCompare(b))
}

const RECENT_PATH_LIMIT = 8
const recentPaths = new Map<string, string[]>()

/** Session-only, per repo worktree: paths are repo-relative. */
export function rememberGitHistoryGraphPath(worktreeId: string, path: string): void {
  const previous = recentPaths.get(worktreeId) ?? []
  recentPaths.set(
    worktreeId,
    [path, ...previous.filter((entry) => entry !== path)].slice(0, RECENT_PATH_LIMIT)
  )
}

export function listRecentGitHistoryGraphPaths(worktreeId: string): readonly string[] {
  return recentPaths.get(worktreeId) ?? []
}

/** Also forgets remembered authors. */
export function resetRecentGitHistoryGraphPathsForTest(): void {
  recentPaths.clear()
  seenAuthors.clear()
}

const TOKEN_KEYS: readonly GitHistoryGraphQueryTokenKey[] = ['author', 'path']

/** The query without its `author:` / `path:` tokens: what the full view's search box shows. */
export function stripGitHistoryGraphQueryTokens(query: string): string {
  return TOKEN_KEYS.reduce((rest, key) => setGitHistoryGraphQueryToken(rest, key, null), query)
}

/**
 * The query after the search box changed from `previousText` to `text`.
 * Why carry only tokens the box did not hold: those came from the User / Paths buttons, while a
 * token typed and then deleted in the box must go away with it.
 */
export function mergeGitHistoryGraphFreeText(
  query: string,
  previousText: string,
  text: string
): string {
  return TOKEN_KEYS.reduce((next, key) => {
    const fromButton = readGitHistoryGraphQueryToken(previousText, key)
      ? null
      : readGitHistoryGraphQueryToken(query, key)
    return fromButton && !readGitHistoryGraphQueryToken(next, key)
      ? setGitHistoryGraphQueryToken(next, key, fromButton)
      : next
  }, text)
}
