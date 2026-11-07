import { createContext, useContext, useMemo } from 'react'
import { resolveOpenGitWorktreeId } from '@/store/slices/editor/git/open-file-git-owner'
import { createdReviewIsForeground } from '../../hosted-review/creation/created-review-foreground'

/** Pins a Source Control panel to one repo of a folder workspace instead of the active worktree. */
export type SourceControlWorktreeScope = {
  /** Worktree whose git state the panel reads and mutates. */
  gitWorktreeId: string
  /** Worktree whose editor receives the tabs the panel opens (the active folder workspace). */
  editorWorktreeId: string
  /** Repo name shown in the panel toolbar so the detail pane names what it shows. */
  label?: string
  /** Repo colour mark beside the label. */
  color?: string
}

export const SourceControlWorktreeScopeContext = createContext<SourceControlWorktreeScope | null>(
  null
)

export function useSourceControlWorktreeScope(): SourceControlWorktreeScope | null {
  return useContext(SourceControlWorktreeScopeContext)
}

/** Tab owner (the editor that shows a tab) and git owner (the repo backing it, or undefined when it is the tab owner). */
export type TabOwners = { tabOwnerId: string; gitOwnerId: string | undefined }

/** Owners of tabs opened for a repo ('' when none) from a panel whose editor may be a folder workspace's. */
export function resolveTabOwners(
  editorWorktreeId: string | null | undefined,
  repoWorktreeId: string
): TabOwners {
  const tabOwnerId = editorWorktreeId ?? repoWorktreeId
  return {
    tabOwnerId,
    gitOwnerId: resolveOpenGitWorktreeId(tabOwnerId, { gitWorktreeId: repoWorktreeId || undefined })
  }
}

export function useSourceControlOwners(repoWorktreeId: string): TabOwners {
  return resolveTabOwners(useSourceControlWorktreeScope()?.editorWorktreeId, repoWorktreeId)
}

/** Where a review created from the panel shows: links follow the folder workspace when scoped; Checks only unscoped. */
export function useSourceControlReviewForeground(activeWorktreeId: string | null): {
  foreground: string | null
  isForeground: () => boolean
  opensChecks: () => boolean
} {
  const scope = useSourceControlWorktreeScope()
  const foreground = scope?.editorWorktreeId ?? activeWorktreeId
  return useMemo(
    () => ({
      foreground,
      isForeground: () => createdReviewIsForeground(foreground),
      // Why: the Checks tab is hidden in folder workspaces, so a scoped section never switches to it.
      opensChecks: () => !scope && createdReviewIsForeground(activeWorktreeId)
    }),
    [activeWorktreeId, foreground, scope]
  )
}

/** Where a folder repo section's agent launches: the folder workspace, started inside the repo. */
export function folderRepoAgentPlacement<W, P>(
  editorWorktreeId: string | null | undefined,
  activeWorktreeId: W,
  repoPath: P
): { worktreeId: string | W; initialCwd: P | undefined } {
  return {
    worktreeId: editorWorktreeId ?? activeWorktreeId,
    initialCwd: editorWorktreeId && editorWorktreeId !== activeWorktreeId ? repoPath : undefined
  }
}
