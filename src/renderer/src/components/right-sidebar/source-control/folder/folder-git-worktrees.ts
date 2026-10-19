import { isPathInsideOrEqual } from '../../../../../../shared/cross-platform-path'
import {
  getRepoExecutionHostId,
  getRepoSshConnectionId
} from '../../../../../../shared/execution-host'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import { isGitRepoKind } from '../../../../../../shared/repo-kind'
import type { Repo } from '../../../../../../shared/repo-types'
import { getHiddenExternalWorktrees } from '../../../../../../shared/external-worktree-inbox'
import type { DetectedWorktreeListResult, Worktree } from '../../../../../../shared/worktree/types'

type FilesystemOwnerFields = Pick<Repo, 'connectionId' | 'executionHostId'>

// Why: a paired server's native repos and its nested SSH repos share one runtime host id; only the SSH target tells their filesystems apart.
export function getFilesystemOwnerKey(owner: FilesystemOwnerFields): string {
  return `${getRepoExecutionHostId(owner)}|${getRepoSshConnectionId(owner) ?? ''}`
}

export type FolderGitWorktree = {
  repo: Repo
  worktree: Worktree
  /** The worktree is the folder or one of its parents, so it also holds files outside the folder. */
  containsFolder: boolean
}

/**
 * Git worktrees a folder workspace's multi-repo Source Control lists: every imported repo
 * worktree on the folder's host that lives under its folder, plus one that contains the folder. Unimported nested repos are absent
 * by design — main-process git calls refuse paths that are not registered repos/worktrees.
 */
export function getFolderGitWorktrees(
  folderWorkspace: Pick<FolderWorkspace, 'folderPath' | 'connectionId' | 'executionHostId'>,
  worktrees: readonly Worktree[],
  repoById: ReadonlyMap<string, Repo>
): FolderGitWorktree[] {
  const ownerKey = getFilesystemOwnerKey(folderWorkspace)
  const result: FolderGitWorktree[] = []
  for (const worktree of worktrees) {
    const repo = repoById.get(worktree.repoId)
    if (!repo || !isGitRepoKind(repo) || getFilesystemOwnerKey(repo) !== ownerKey) {
      continue
    }
    if (isPathInsideOrEqual(folderWorkspace.folderPath, worktree.path)) {
      result.push({ repo, worktree, containsFolder: false })
    } else if (isPathInsideOrEqual(worktree.path, folderWorkspace.folderPath)) {
      result.push({ repo, worktree, containsFolder: true })
    }
  }
  return result.sort(
    (a, b) =>
      a.repo.displayName.localeCompare(b.repo.displayName) ||
      Number(b.worktree.isMainWorktree) - Number(a.worktree.isMainWorktree) ||
      a.worktree.path.localeCompare(b.worktree.path)
  )
}

/** Linked worktrees physically under the folder that sidebar visibility hides, so they are not listed or copied. */
export function countHiddenFolderWorktrees(
  folderWorkspace: Pick<FolderWorkspace, 'folderPath' | 'connectionId' | 'executionHostId'>,
  detectedByRepo: Readonly<Record<string, DetectedWorktreeListResult | undefined>>,
  repoById: ReadonlyMap<string, Repo>
): number {
  const ownerKey = getFilesystemOwnerKey(folderWorkspace)
  let count = 0
  for (const [repoId, detected] of Object.entries(detectedByRepo)) {
    const repo = repoById.get(repoId)
    if (!repo || !isGitRepoKind(repo) || getFilesystemOwnerKey(repo) !== ownerKey) {
      continue
    }
    count += getHiddenExternalWorktrees(detected).filter((worktree) =>
      isPathInsideOrEqual(folderWorkspace.folderPath, worktree.path)
    ).length
  }
  return count
}
