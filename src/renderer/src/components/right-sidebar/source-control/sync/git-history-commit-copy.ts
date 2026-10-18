// Fork-only: Copy Full Source for commits in the history graph.
import { getConnectionId } from '@/lib/connection-context'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import { requireGitOwnerTarget } from '../../worktree-git-owner-target'
import { copyClipcodeCommitChanges, getClipcodeRootPath } from '../clipcode/clipcode-copy-action'

export async function copyHistoryCommitsFullSource(args: {
  /** Newest first, as the graph lists them. */
  items: readonly GitHistoryItem[]
  worktreeId: string
  worktreePath: string
  /** Folder workspace owning the panel; paths are then relative to the folder, like Copy Full Source. */
  editorWorktreeId: string | null
  activeRepoTarget: RuntimeClientTarget | null
  loadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
}): Promise<void> {
  await copyClipcodeCommitChanges({
    rootPath: getClipcodeRootPath(args.editorWorktreeId, args.worktreePath),
    context: {
      // Why: route reads by the repo OWNER host, not the focused runtime.
      target: requireGitOwnerTarget(args.activeRepoTarget),
      worktreeId: args.worktreeId,
      worktreePath: args.worktreePath,
      connectionId: getConnectionId(args.worktreeId) ?? undefined
    },
    loadCommits: () =>
      Promise.all(
        args.items.map(async (item) => ({
          commitOid: item.id,
          parentOids: item.parentIds,
          entries: await args.loadCommitFiles(item)
        }))
      )
  })
}
