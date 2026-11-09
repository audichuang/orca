// Fork-only: upstream's folder Source Control lists the folder's attached (lineage) worktrees; the fork
// also lists every registered repo worktree under the folder path, as its folder panel did.
import { getIndexedAllWorktrees } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { AppState } from '@/store/types'
import type {
  AttachedWorktreeOwner,
  AttachedWorktreeResolution
} from '../../folder-workspace-attached-worktrees'
import { getFolderGitWorktrees } from './folder-git-worktrees'

/** Owner card for a registered repo worktree upstream's folder resolution does not attach. */
export function folderRepoOwner(repo: Repo, worktree: Worktree): AttachedWorktreeOwner {
  return {
    worktreeId: worktree.id,
    repoId: repo.id,
    executionHostId: getRepoExecutionHostId(repo),
    worktree,
    attachedAt: 0
  }
}

/** Upstream's owners followed by the folder-path repos it does not already list, in folder-panel order. */
export function withFolderPathRepoOwners(
  resolution: Pick<AttachedWorktreeResolution, 'folderWorkspace' | 'owners'>,
  worktreesByRepo: AppState['worktreesByRepo'],
  repos: readonly Repo[]
): AttachedWorktreeOwner[] {
  const folder = resolution.folderWorkspace
  if (!folder) {
    return resolution.owners
  }
  const listed = new Set(resolution.owners.map((owner) => owner.worktreeId))
  const extra = getFolderGitWorktrees(folder, getIndexedAllWorktrees(worktreesByRepo), repos)
    .filter(({ worktree }) => !listed.has(worktree.id))
    .map(({ repo, worktree }) => folderRepoOwner(repo, worktree))
  return extra.length > 0 ? [...resolution.owners, ...extra] : resolution.owners
}
