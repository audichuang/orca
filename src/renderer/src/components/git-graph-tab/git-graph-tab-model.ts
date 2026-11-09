// Fork-only: which repo worktrees a Git Graph editor tab can show, and which one it opens on.
import type { AppState } from '@/store/types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { getIndexedAllWorktrees } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { getIndexedRepoMap } from '@/store/repos/repository-catalog-index'
import { getFilesystemOwnerKey } from '../right-sidebar/source-control/folder/folder-git-worktrees'
import { withFolderPathRepoOwners } from '../right-sidebar/source-control/folder/folder-path-repo-owners'
import { getRememberedFolderRepo } from '../right-sidebar/source-control/folder/folder-repo-selection'
import { getAttachedWorktreesForFolderWorkspace } from '../right-sidebar/folder-workspace-attached-worktrees'
import { resolveReviewRepository } from '@/lib/review-owner'
import {
  selectCrossStoreFolderChildrenById,
  selectSidebarLineageParentIdentities
} from '@/store/slices/worktrees/metadata/cross-store-lineage-parents'
import type { SidebarLineageParentIdentities } from '../../../../shared/sidebar-list/worktree-lineage-projection'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'

export const GIT_GRAPH_TAB_LABEL = 'Git Graph'

export type GitGraphRepoChoice = { repo: Repo; worktree: Worktree }

/** Store fields the folder lineage selectors read, as upstream's folder Source Control subscribes them. */
type GitGraphWorkspaceState = Parameters<typeof selectCrossStoreFolderChildrenById>[0] &
  Pick<AppState, 'repos' | 'workspaceLineageByChildKey'>

/** What the Git Graph repo choices read; the lineage fields are the folder Source Control selectors' results. */
export type GitGraphChoiceInputs = Pick<
  AppState,
  'repos' | 'workspaceLineageByChildKey' | 'worktreeLineageById'
> & {
  /** selectWorktreesByRepo's view. */
  repoWorktrees: AppState['worktreesByRepo']
  /** selectFolderWorkspaces's view. */
  folders: AppState['folderWorkspaces']
  lineageParentIdentities: SidebarLineageParentIdentities | undefined
  crossStoreChildrenByFolderId: ReadonlyMap<string, readonly Worktree[]>
}

export function selectGitGraphChoiceInputs(state: GitGraphWorkspaceState): GitGraphChoiceInputs {
  return {
    repos: state.repos,
    repoWorktrees: selectWorktreesByRepo(state),
    folders: selectFolderWorkspaces(state),
    workspaceLineageByChildKey: state.workspaceLineageByChildKey,
    worktreeLineageById: state.worktreeLineageById,
    lineageParentIdentities: selectSidebarLineageParentIdentities(state),
    crossStoreChildrenByFolderId: selectCrossStoreFolderChildrenById(state)
  }
}

/** The folder's Source Control owners (attached worktrees, then folder-path repos), each with its host-matched repo as Source Control resolves it. */
function listGitGraphFolderChoices(
  inputs: GitGraphChoiceInputs,
  workspaceId: string
): GitGraphRepoChoice[] {
  const resolution = getAttachedWorktreesForFolderWorkspace({
    activeWorkspaceKey: workspaceId,
    activeWorktreeId: workspaceId,
    folderWorkspaces: inputs.folders ?? [],
    workspaceLineageByChildKey: inputs.workspaceLineageByChildKey,
    worktreeLineageById: inputs.worktreeLineageById,
    worktreesByRepo: inputs.repoWorktrees,
    lineageParentIdentities: inputs.lineageParentIdentities,
    crossStoreChildrenByFolderId: inputs.crossStoreChildrenByFolderId
  })
  return withFolderPathRepoOwners(resolution, inputs.repoWorktrees, inputs.repos).flatMap(
    (owner) => {
      const repo = resolveReviewRepository(inputs.repos, owner.worktree)
      return repo && isGitRepoKind(repo) ? [{ repo, worktree: owner.worktree }] : []
    }
  )
}

/** One Git Graph tab per workspace, so reopening focuses it instead of stacking copies. */
export function buildGitGraphTabId(workspaceId: string): string {
  return `${workspaceId}::git-graph`
}

/** Every git worktree on the non-folder workspace's own filesystem owner (git reads must stay on the host that owns the files). */
export function listGitGraphRepoChoices(
  workspaceId: string,
  worktrees: readonly Worktree[],
  repos: AppState['repos']
): GitGraphRepoChoice[] {
  const repoById = getIndexedRepoMap(repos)
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

export function listGitGraphRepoChoicesFromInputs(
  inputs: GitGraphChoiceInputs,
  workspaceId: string
): GitGraphRepoChoice[] {
  if (parseWorkspaceKey(workspaceId)?.type === 'folder') {
    return listGitGraphFolderChoices(inputs, workspaceId)
  }
  return listGitGraphRepoChoices(
    workspaceId,
    getIndexedAllWorktrees(inputs.repoWorktrees),
    inputs.repos
  )
}

export function listGitGraphRepoChoicesFromState(
  state: GitGraphWorkspaceState,
  workspaceId: string
): GitGraphRepoChoice[] {
  return listGitGraphRepoChoicesFromInputs(selectGitGraphChoiceInputs(state), workspaceId)
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
