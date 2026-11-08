// Fork-only: links between the Git Graph tab and the right-sidebar Source Control.
import type { GitHistoryItem } from '../../../../shared/git/history/git-history-types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { useAppStore } from '@/store'
import { rememberFolderRepo } from '../right-sidebar/source-control/folder/folder-repo-selection'

/** Shows Source Control in the right sidebar, on the given repo when the workspace is a folder. */
export function openSourceControlOnRepo(workspaceId: string, repoWorktreeId: string): void {
  if (parseWorkspaceKey(workspaceId)?.type === 'folder') {
    rememberFolderRepo(workspaceId, repoWorktreeId)
  }
  const state = useAppStore.getState()
  state.setRightSidebarTab('source-control')
  state.setRightSidebarOpen(true)
}

/** Commits menu handler: the workspace's Git Graph tab, on this repo, with the commit selected. */
export function showCommitInGitGraphSlot(
  workspaceId: string,
  repoWorktreeId: string
): (item: GitHistoryItem) => void {
  return (item) =>
    useAppStore.getState().openGitGraphTab(workspaceId, { repoWorktreeId, revealCommit: item.id })
}
