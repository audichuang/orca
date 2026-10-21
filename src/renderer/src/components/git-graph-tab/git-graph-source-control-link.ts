// Fork-only: keeps the Git Graph tab and the right-sidebar Source Control on the same repo.
import type { GitHistoryItem } from '../../../../shared/git-history'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { useAppStore } from '@/store'
import {
  getRememberedFolderRepo,
  rememberFolderRepo
} from '../right-sidebar/source-control/folder/folder-repo-selection'
import { buildGitGraphTabId } from './git-graph-tab-model'
import { scheduleGitGraphRepoFollow } from './git-graph-deferred-repo-follow'

/**
 * A repo picked in a folder's Source Control; an already-open Git Graph tab follows, none is opened.
 * `defer` (keyboard walks) moves the tab only once the picks pause, and only if the pick still stands.
 */
export function pickFolderRepo(
  folderWorkspaceKey: string,
  repoWorktreeId: string,
  opts?: { defer?: boolean }
): void {
  rememberFolderRepo(folderWorkspaceKey, repoWorktreeId)
  const follow = (): void =>
    useAppStore
      .getState()
      .setGitGraphTabRepo(buildGitGraphTabId(folderWorkspaceKey), repoWorktreeId)
  if (!opts?.defer) {
    follow()
    return
  }
  scheduleGitGraphRepoFollow(folderWorkspaceKey, () => {
    if (getRememberedFolderRepo(folderWorkspaceKey) === repoWorktreeId) {
      follow()
    }
  })
}

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
