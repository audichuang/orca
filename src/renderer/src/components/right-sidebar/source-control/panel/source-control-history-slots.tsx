// Fork-only: what the fork plugs into upstream's Commits panel in the Source Control sidebar.
import { GitHistoryGraphToolbar } from '../sync/git-history-graph-toolbar'
import { GitHistoryGraphLoadMore } from '../sync/git-history-graph-host-status'
import { GitHistoryGraphEmptyMessage } from '../sync/git-history-graph-empty-message'
import { GitGraphTabLauncher } from '../sync/git-graph-tab-launcher'
import { commitFilesMenuSlot } from '../sync/git-history-commit-files-menu'
import type { GitHistoryPanelSlots } from '../sync/git-history-panel-slots'
import { showCommitInGitGraphSlot } from '../../../git-graph-tab/git-graph-source-control-link'
import type { SourceControlPanelReadyProps } from './panel-props'

/** `tabOwnerId` opens Git Graph tabs (a folder workspace in a folder repo section); `repoWorktreeId` reads git. */
export function sourceControlHistorySlots({
  model,
  tabOwnerId,
  repoWorktreeId,
  worktreePath
}: {
  model: SourceControlPanelReadyProps['model']
  tabOwnerId: string
  repoWorktreeId: string
  worktreePath: string
}): GitHistoryPanelSlots {
  const { activeRepoTarget, gitHistoryState, loadCommitFiles } = model
  return {
    renderCommitFilesMenu: commitFilesMenuSlot(
      model,
      repoWorktreeId,
      worktreePath,
      loadCommitFiles
    ),
    onShowCommitInGraph: showCommitInGitGraphSlot(tabOwnerId, repoWorktreeId),
    headerActions: <GitGraphTabLauncher workspaceId={tabOwnerId} repoWorktreeId={repoWorktreeId} />,
    toolbar: (
      <GitHistoryGraphToolbar
        worktreeId={repoWorktreeId}
        worktreePath={worktreePath}
        activeRepoTarget={activeRepoTarget}
        state={gitHistoryState}
      />
    ),
    footer: <GitHistoryGraphLoadMore worktreeId={repoWorktreeId} state={gitHistoryState} />,
    emptyMessage: <GitHistoryGraphEmptyMessage worktreeId={repoWorktreeId} />
  }
}
