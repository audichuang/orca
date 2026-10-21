// Fork-only: splits a folder workspace's repo rows into "Changes" and "No changes" groups.

export type FolderRepoGroupId = 'changes' | 'clean'

export type FolderRepoListItem =
  | { kind: 'group'; group: FolderRepoGroupId; count: number; expanded: boolean }
  | { kind: 'repo'; index: number }

/**
 * Rows in drawn order. While filtering the matches are listed flat; otherwise dirty repos come first and
 * each group's rows show only when it is expanded, except the open repo, which stays visible.
 */
export function buildFolderRepoListItems(args: {
  visibleIndexes: readonly number[]
  changeCounts: readonly (number | undefined)[]
  /** True per index when the repo has commits to push or pull, so a clean tree still needs attention. */
  pendingSync: readonly boolean[]
  filtering: boolean
  expandedGroups: ReadonlySet<FolderRepoGroupId>
  selectedIndex: number
}): FolderRepoListItem[] {
  const { visibleIndexes, changeCounts, pendingSync, filtering, expandedGroups, selectedIndex } =
    args
  if (filtering) {
    return visibleIndexes.map((index) => ({ kind: 'repo', index }))
  }
  // Why: an unknown count is still loading, not clean, so it waits in the open group instead of hiding.
  const isClean = (index: number) => changeCounts[index] === 0 && !pendingSync[index]
  const groups: [FolderRepoGroupId, number[]][] = [
    ['changes', visibleIndexes.filter((index) => !isClean(index))],
    ['clean', visibleIndexes.filter(isClean)]
  ]
  const items: FolderRepoListItem[] = []
  for (const [group, indexes] of groups) {
    if (indexes.length === 0) {
      continue
    }
    const expanded = expandedGroups.has(group)
    items.push({ kind: 'group', group, count: indexes.length, expanded })
    for (const index of indexes) {
      if (expanded || index === selectedIndex) {
        items.push({ kind: 'repo', index })
      }
    }
  }
  return items
}

const DEFAULT_EXPANDED: readonly FolderRepoGroupId[] = ['changes']
// Why: the panel remounts per folder workspace, so expansion lives outside React like the remembered repo pick.
const expandedByFolder = new Map<string, ReadonlySet<FolderRepoGroupId>>()

export function getFolderRepoExpandedGroups(
  folderWorkspaceKey: string
): ReadonlySet<FolderRepoGroupId> {
  return expandedByFolder.get(folderWorkspaceKey) ?? new Set(DEFAULT_EXPANDED)
}

export function toggleFolderRepoGroup(
  folderWorkspaceKey: string,
  group: FolderRepoGroupId
): ReadonlySet<FolderRepoGroupId> {
  const next = new Set(getFolderRepoExpandedGroups(folderWorkspaceKey))
  if (next.has(group)) {
    next.delete(group)
  } else {
    next.add(group)
  }
  expandedByFolder.set(folderWorkspaceKey, next)
  return next
}
