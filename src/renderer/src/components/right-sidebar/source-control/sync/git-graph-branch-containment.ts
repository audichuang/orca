// Fork-only: which loaded branch tips reach each loaded commit (IntelliJ's "In N branches", Fork's lane context).
import type { GitHistoryItem } from '../../../../../../shared/git-history'

/** Branch ref ids (`refs/heads/…`, `refs/remotes/…`) whose tip reaches the commit, in tip order. */
export type GitGraphBranchContainment = ReadonlyMap<string, readonly string[]>

const EMPTY: readonly string[] = []

function isBranchRef(category: string | undefined): boolean {
  return category === 'branches' || category === 'remote branches'
}

/**
 * Walks the history newest first (graph order is topological, children before parents) and pushes
 * each commit's branch set into its parents. Only loaded commits count, so an unloaded tip is absent.
 */
export function computeBranchContainment(
  items: readonly GitHistoryItem[]
): GitGraphBranchContainment {
  const pending = new Map<string, Set<string>>()
  const result = new Map<string, readonly string[]>()
  for (const item of items) {
    const branches = pending.get(item.id) ?? new Set<string>()
    pending.delete(item.id)
    for (const ref of item.references ?? []) {
      if (isBranchRef(ref.category)) {
        branches.add(ref.id)
      }
    }
    result.set(item.id, branches.size > 0 ? [...branches] : EMPTY)
    for (const parentId of item.parentIds) {
      const parentSet = pending.get(parentId)
      if (parentSet) {
        for (const branch of branches) {
          parentSet.add(branch)
        }
      } else {
        pending.set(parentId, new Set(branches))
      }
    }
  }
  return result
}
