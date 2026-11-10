import { isPathInsideOrEqual } from '../../../../../../shared/cross-platform-path'
import {
  getRepoExecutionHostId,
  getRepoSshConnectionId
} from '../../../../../../shared/execution-host'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspaces/folder-workspace-types'
import { resolveReviewRepository } from '@/lib/review-owner'
import { isGitRepoKind } from '../../../../../../shared/repo-kind'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'

type FilesystemOwnerFields = Pick<Repo, 'connectionId' | 'executionHostId'>

// Why: a paired server's native repos and its nested SSH repos share one runtime host id; only the SSH target tells their filesystems apart.
export function getFilesystemOwnerKey(owner: FilesystemOwnerFields): string {
  return `${getRepoExecutionHostId(owner)}|${getRepoSshConnectionId(owner) ?? ''}`
}

// Why: hostless legacy worktrees can't disambiguate a shared repo id, so the folder's owner-filtered pick stands; otherwise the worktree must resolve to that exact repo row.
function worktreeBelongsToRepo(repos: readonly Repo[], repo: Repo, worktree: Worktree): boolean {
  if (!worktree.hostId && !worktree.runtimeOwnerEnvironmentId) {
    return true
  }
  return resolveReviewRepository(repos, worktree) === repo
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
  repos: readonly Repo[]
): FolderGitWorktree[] {
  const ownerKey = getFilesystemOwnerKey(folderWorkspace)
  // Why filter before keying by id: a local and a remote repo can share one id.
  const repoById = new Map(
    repos
      .filter((repo) => isGitRepoKind(repo) && getFilesystemOwnerKey(repo) === ownerKey)
      .map((repo) => [repo.id, repo])
  )
  const result: FolderGitWorktree[] = []
  for (const worktree of worktrees) {
    const repo = repoById.get(worktree.repoId)
    if (!repo || !worktreeBelongsToRepo(repos, repo, worktree)) {
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
