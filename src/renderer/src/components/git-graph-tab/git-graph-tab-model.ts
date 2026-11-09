// Fork-only: which repo worktrees a Git Graph editor tab can show, and which one it opens on.
import type { AppState } from '@/store/types'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { getIndexedAllWorktrees } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { getIndexedRepoMap } from '@/store/repos/repository-catalog-index'
import {
  getFilesystemOwnerKey,
  getFolderGitWorktrees
} from '../right-sidebar/source-control/folder/folder-git-worktrees'
import { getRememberedFolderRepo } from '../right-sidebar/source-control/folder/folder-repo-selection'
import { getAttachedWorktreesForFolderWorkspace } from '../right-sidebar/folder-workspace-attached-worktrees'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'

export const GIT_GRAPH_TAB_LABEL = 'Git Graph'

export type GitGraphRepoChoice = { repo: Repo; worktree: Worktree }

type GitGraphWorkspaceState = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'folderWorkspaces'
  | 'workspaceLineageByChildKey'
  | 'worktreeLineageById'
>

type FolderLineageState = Pick<
  AppState,
  'folderWorkspaces' | 'workspaceLineageByChildKey' | 'worktreeLineageById' | 'worktreesByRepo'
>

/** Upstream's attached worktrees of a folder (lineage children, which may live outside its path). */
export function getGitGraphFolderAttachedWorktrees(
  state: FolderLineageState,
  workspaceId: string
): Worktree[] {
  if (parseWorkspaceKey(workspaceId)?.type !== 'folder') {
    return []
  }
  return getAttachedWorktreesForFolderWorkspace({
    activeWorkspaceKey: workspaceId,
    activeWorktreeId: workspaceId,
    folderWorkspaces: selectFolderWorkspaces(state) ?? [],
    workspaceLineageByChildKey: state.workspaceLineageByChildKey,
    worktreeLineageById: state.worktreeLineageById,
    worktreesByRepo: selectWorktreesByRepo(state),
    crossStoreChildrenByFolderId: new Map()
  }).childWorktrees
}

/** One Git Graph tab per workspace, so reopening focuses it instead of stacking copies. */
export function buildGitGraphTabId(workspaceId: string): string {
  return `${workspaceId}::git-graph`
}

/**
 * Repo worktrees the tab may switch to: a folder's member repos plus the worktrees upstream's folder
 * Source Control attaches to it, or every git worktree on the workspace's own filesystem owner (git
 * reads must stay on the host that owns the files).
 */
export function listGitGraphRepoChoices(
  workspaceId: string,
  worktrees: readonly Worktree[],
  repoById: ReadonlyMap<string, Repo>,
  folderWorkspaces: readonly FolderWorkspace[],
  folderAttached: readonly Worktree[] = []
): GitGraphRepoChoice[] {
  const scope = parseWorkspaceKey(workspaceId)
  if (scope?.type === 'folder') {
    const folder = folderWorkspaces.find((entry) => entry.id === scope.folderWorkspaceId)
    if (!folder) {
      return []
    }
    const choices = getFolderGitWorktrees(folder, worktrees, repoById)
    const listed = new Set(choices.map((choice) => choice.worktree.id))
    for (const worktree of folderAttached) {
      const repo = repoById.get(worktree.repoId)
      if (repo && isGitRepoKind(repo) && !listed.has(worktree.id)) {
        listed.add(worktree.id)
        choices.push({ repo, worktree, containsFolder: false })
      }
    }
    return choices
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
    getIndexedAllWorktrees(selectWorktreesByRepo(state)),
    getIndexedRepoMap(state.repos),
    selectFolderWorkspaces(state) ?? [],
    getGitGraphFolderAttachedWorktrees(state, workspaceId)
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
