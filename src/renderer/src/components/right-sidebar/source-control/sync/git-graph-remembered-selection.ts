// Fork-only: the full Git Graph's selection memory, apart from the view so tab cleanup can reach it
// without importing the store back into itself.
import type { GitHistoryCommitSelectionSnapshot } from './use-git-history-commit-selection'

export type RememberedGitGraphSelection = {
  commitId: string | null
  commits: GitHistoryCommitSelectionSnapshot | null
}

// Why module scope: the editor renders only the active tab, so opening a diff unmounts the view, and
// returning should land on the same commits, like returning to IntelliJ's log.
// Keyed by host-qualified worktree identity (two hosts can publish the same worktree id), grouped by
// the hosting tab so closing it can drop what it remembered.
const rememberedByScope = new Map<string, Map<string, RememberedGitGraphSelection>>()

export function peekRememberedGitGraphSelection(
  scope: string,
  selectionKey: string
): RememberedGitGraphSelection | undefined {
  return rememberedByScope.get(scope)?.get(selectionKey)
}

export function rememberGitGraphSelection(
  scope: string,
  selectionKey: string,
  update: (entry: RememberedGitGraphSelection | undefined) => RememberedGitGraphSelection
): void {
  let byWorktree = rememberedByScope.get(scope)
  if (!byWorktree) {
    byWorktree = new Map()
    rememberedByScope.set(scope, byWorktree)
  }
  byWorktree.set(selectionKey, update(byWorktree.get(selectionKey)))
}

/** A closed tab's reopen starts on the checked-out commit, like a first open. */
export function forgetGitGraphRememberedSelection(scope: string): void {
  rememberedByScope.delete(scope)
}

export function clearGitGraphRememberedSelections(): void {
  rememberedByScope.clear()
}
