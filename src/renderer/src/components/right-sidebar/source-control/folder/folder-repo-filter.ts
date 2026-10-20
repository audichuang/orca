/** Below this many repos the list fits at a glance, so the filter box would only add clutter. */
export const FOLDER_REPO_FILTER_MIN_REPOS = 6

/** Indexes of the labels containing every whitespace-separated term of the query, case-insensitive. */
export function filterFolderRepoIndexes(labels: readonly string[], query: string): number[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return labels.flatMap((label, index) => {
    const text = label.toLowerCase()
    return terms.every((term) => text.includes(term)) ? [index] : []
  })
}

/** Headers to list: the matches plus the open repo, which keeps its header so its panel stays anchored. */
export function getFolderRepoFilterView(
  labels: readonly string[],
  query: string,
  expandedIndex: number
): { matchIndexes: number[]; visibleIndexes: number[] } {
  const matchIndexes = filterFolderRepoIndexes(labels, query)
  const visibleIndexes =
    expandedIndex === -1 || matchIndexes.includes(expandedIndex)
      ? matchIndexes
      : [...matchIndexes, expandedIndex].sort((left, right) => left - right)
  return { matchIndexes, visibleIndexes }
}
