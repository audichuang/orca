// Fork-only: which repo worktrees a Git Graph editor tab can show, and which one it opens on.
import type { AppState } from '@/store/types'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { getIndexedAllWorktrees, getIndexedRepoMap } from '@/store/worktree-repo-index'
import {
  getFilesystemOwnerKey,
  getFolderGitWorktrees
} from '../right-sidebar/source-control/folder/folder-git-worktrees'
import { getRememberedFolderRepo } from '../right-sidebar/source-control/folder/folder-repo-selection'

export const GIT_GRAPH_TAB_LABEL = 'Git Graph'

export type GitGraphRepoChoice = { repo: Repo; worktree: Worktree }

type GitGraphWorkspaceState = Pick<AppState, 'repos' | 'worktreesByRepo' | 'folderWorkspaces'>

/** One Git Graph tab per workspace, so reopening focuses it instead of stacking copies. */
export function buildGitGraphTabId(workspaceId: string): string {
  return `${workspaceId}::git-graph`
}

/**
 * Repo worktrees the tab may switch to: a folder's member repos, or every git worktree on the
 * workspace's own filesystem owner (git reads must stay on the host that owns the files).
 */
export function listGitGraphRepoChoices(
  workspaceId: string,
  worktrees: readonly Worktree[],
  repoById: ReadonlyMap<string, Repo>,
  folderWorkspaces: readonly FolderWorkspace[]
): GitGraphRepoChoice[] {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    const folder = folderWorkspaces.find((entry) => entry.id === scope.folderWorkspaceId)
    return folder ? getFolderGitWorktrees(folder, worktrees, repoById) : []
  }
  const own = worktrees.find((worktree) => worktree.id === workspaceId)
  const ownRepo = own ? repoById.get(own.repoId) : undefined
  if (!ownRepo) {
    return []
  }
  const ownerKey = getFilesystemOwnerKey(ownRepo)
  const choices: GitGraphRepoChoice[] = []
  for (const worktree of worktrees) {
    const repo = repoById.get(worktree.repoId)
    if (repo && isGitRepoKind(repo) && getFilesystemOwnerKey(repo) === ownerKey) {
      choices.push({ repo, worktree })
    }
  }
  return choices.sort(
    (a, b) =>
      a.repo.displayName.localeCompare(b.repo.displayName) ||
      Number(b.worktree.isMainWorktree) - Number(a.worktree.isMainWorktree) ||
      a.worktree.path.localeCompare(b.worktree.path)
  )
}

export function listGitGraphRepoChoicesFromState(
  state: GitGraphWorkspaceState,
  workspaceId: string
): GitGraphRepoChoice[] {
  return listGitGraphRepoChoices(
    workspaceId,
    getIndexedAllWorktrees(state.worktreesByRepo),
    getIndexedRepoMap(state.repos),
    state.folderWorkspaces ?? []
  )
}

/** The workspace's own repo, or for a folder the member picked last in Source Control, else the first. */
export function resolveGitGraphDefaultRepoWorktreeId(
  state: GitGraphWorkspaceState,
  workspaceId: string
): string | null {
  const choices = listGitGraphRepoChoicesFromState(state, workspaceId)
  if (parseWorkspaceKey(workspaceId)?.type === 'folder') {
    const remembered = getRememberedFolderRepo(workspaceId)
    const match = choices.find((choice) => choice.worktree.id === remembered)
    return (match ?? choices[0])?.worktree.id ?? null
  }
  return choices.some((choice) => choice.worktree.id === workspaceId) ? workspaceId : null
}

/** The Cmd+J palette's optional Git Graph fields for the active workspace. */
export function buildGitGraphQuickActionContext(
  state: GitGraphWorkspaceState & Pick<AppState, 'openGitGraphTab'>,
  workspaceId: string | null
): { canOpenGitGraph: boolean; openGitGraph: () => void } {
  return {
    canOpenGitGraph:
      workspaceId !== null && resolveGitGraphDefaultRepoWorktreeId(state, workspaceId) !== null,
    openGitGraph: () => {
      if (workspaceId) {
        state.openGitGraphTab(workspaceId)
      }
    }
  }
}
