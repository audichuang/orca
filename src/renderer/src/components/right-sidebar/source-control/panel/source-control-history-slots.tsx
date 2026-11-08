// Fork-only: what the fork plugs into upstream's Commits panel in the Source Control sidebar.
import { commitFilesMenuSlot } from '../sync/git-history-commit-files-menu'
import type { GitHistoryPanelSlots } from '../sync/git-history-panel-slots'
import type { SourceControlPanelReadyProps } from './panel-props'

export function sourceControlHistorySlots({
  model,
  repoWorktreeId,
  worktreePath
}: {
  model: SourceControlPanelReadyProps['model']
  repoWorktreeId: string
  worktreePath: string
}): GitHistoryPanelSlots {
  return {
    renderCommitFilesMenu: commitFilesMenuSlot(
      model,
      repoWorktreeId,
      worktreePath,
      model.loadCommitFiles
    )
  }
}
