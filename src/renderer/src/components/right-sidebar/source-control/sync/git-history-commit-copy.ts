// Fork-only: Copy Full Source for commits in the history graph.
import { toast } from 'sonner'
import { getConnectionId } from '@/lib/connection-context'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import { requireGitOwnerTarget } from '../../worktree-git-owner-target'
import { copyClipcodeCommitChanges, getClipcodeRootPath } from '../clipcode/clipcode-copy-action'

export async function copyHistoryCommitsFullSource(args: {
  items: readonly GitHistoryItem[]
  worktreeId: string
  worktreePath: string
  /** Folder workspace owning the panel; paths are then relative to the folder, like Copy Full Source. */
  editorWorktreeId: string | null
  activeRepoTarget: RuntimeClientTarget | null
  loadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
}): Promise<void> {
  let entriesByCommit: GitBranchChangeEntry[][]
  try {
    entriesByCommit = await Promise.all(args.items.map((item) => args.loadCommitFiles(item)))
  } catch (error) {
    toast.error(
      translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.7c6daaf4fa',
        'Copy Full Source failed'
      ),
      { description: readIpcErrorMessage(error) }
    )
    return
  }
  await copyClipcodeCommitChanges({
    rootPath: getClipcodeRootPath(args.editorWorktreeId, args.worktreePath),
    context: {
      // Why: route reads by the repo OWNER host, not the focused runtime.
      target: requireGitOwnerTarget(args.activeRepoTarget),
      worktreeId: args.worktreeId,
      worktreePath: args.worktreePath,
      connectionId: getConnectionId(args.worktreeId) ?? undefined
    },
    commits: args.items.map((item, index) => ({
      commitOid: item.id,
      parentOids: item.parentIds,
      timestamp: item.timestamp,
      entries: entriesByCommit[index] ?? []
    }))
  })
}
