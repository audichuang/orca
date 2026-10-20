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
