import {
  pathMatchesFileNameFilterTokens,
  splitFileNameFilterTokens
} from '../../../../../../shared/file-name-filter-tokens'

/** Below this many repos the list fits at a glance, so the filter box would only add clutter. */
export const FOLDER_REPO_FILTER_MIN_REPOS = 6

/** Indexes of the labels containing every whitespace-separated term of the query, case-insensitive. */
export function filterFolderRepoIndexes(labels: readonly string[], query: string): number[] {
  const tokens = splitFileNameFilterTokens(query)
  return labels.flatMap((label, index) =>
    pathMatchesFileNameFilterTokens(label, tokens) ? [index] : []
  )
}
