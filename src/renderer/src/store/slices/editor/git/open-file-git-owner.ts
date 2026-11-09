import type { AppState } from '../../../types'
import type { OpenFile } from '../types/open-file'
import { getIndexedWorktreesById } from '../../worktrees/listing/worktree-catalog-index'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../../../shared/execution-host'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'

/** Worktree whose git state backs a tab; differs from the tab owner for folder-workspace repo sections. */
export function getOpenFileGitWorktreeId(
  file: Pick<OpenFile, 'worktreeId' | 'gitWorktreeId'>
): string {
  return file.gitWorktreeId ?? file.worktreeId
}

/** Path git and repo-selector reads expect: derived from filePath so it holds whichever root relativePath is relative to. */
export function getOpenFileGitRelativePath(
  state: Pick<AppState, 'worktreesByRepo'>,
  file: Pick<OpenFile, 'worktreeId' | 'gitWorktreeId' | 'filePath' | 'relativePath'>
): string {
  if (!file.gitWorktreeId || file.gitWorktreeId === file.worktreeId) {
    return file.relativePath
  }
  // Why: every host's row, since a bare id can name two hosts' worktrees.
  for (const worktree of getIndexedWorktreesById(
    selectWorktreesByRepo(state),
    file.gitWorktreeId
  )) {
    const relativePath = relativePathInsideRoot(worktree.path, file.filePath)
    if (relativePath) {
      return relativePath
    }
  }
  return file.relativePath
}

/** Path relative to the tab owner's root; a git-owned tab's relativePath is repo-relative instead. */
export function resolveTabOwnerRelativePath(
  state: Pick<AppState, 'folderWorkspaces'>,
  file: Pick<
    OpenFile,
    'gitWorktreeId' | 'worktreeId' | 'relativePath' | 'filePath' | 'runtimeEnvironmentId'
  >,
  worktreePath: string | null
): string | null {
  if (!file.gitWorktreeId || file.gitWorktreeId === file.worktreeId) {
    return file.relativePath
  }
  const root =
    parseWorkspaceKey(file.worktreeId)?.type === 'folder'
      ? getTabOwnerFolderRoot(state, file)
      : worktreePath
  return root ? relativePathInsideRoot(root, file.filePath) : null
}

/** filePath relative to the root of its folder tab owner on the tab's host; null when the owner is no folder or the root is ambiguous. */
export function folderOwnerRelativePath(
  state: Pick<AppState, 'folderWorkspaces'>,
  file: Pick<OpenFile, 'worktreeId' | 'filePath' | 'runtimeEnvironmentId'>
): string | null {
  const root = getTabOwnerFolderRoot(state, file)
  return root ? relativePathInsideRoot(root, file.filePath) : null
}

function getTabOwnerFolderRoot(
  state: Pick<AppState, 'folderWorkspaces'>,
  file: Pick<OpenFile, 'worktreeId' | 'filePath' | 'runtimeEnvironmentId'>
): string | null {
  const scope = parseWorkspaceKey(file.worktreeId)
  if (scope?.type !== 'folder') {
    return null
  }
  // Why: hosts can share a folder id with different (even nested) roots; only the tab's host's root holding filePath is its owner.
  const runtimeHostId = file.runtimeEnvironmentId
    ? toRuntimeExecutionHostId(file.runtimeEnvironmentId)
    : null
  const candidates = new Set<string>()
  for (const workspace of selectFolderWorkspaces(state) ?? []) {
    if (workspace.id !== scope.folderWorkspaceId) {
      continue
    }
    const hostId = getRepoExecutionHostId(workspace)
    if (
      runtimeHostId ? hostId !== runtimeHostId : parseExecutionHostId(hostId)?.kind === 'runtime'
    ) {
      continue
    }
    if (relativePathInsideRoot(workspace.folderPath, file.filePath)) {
      candidates.add(workspace.folderPath)
    }
  }
  return candidates.size === 1 ? [...candidates][0] : null
}

/** How a restored folder tab's git owner is checked. */
export type HydratedGitOwnerOptions = {
  /** Repos a folder tab's git owner may name; omitted where repos are unknown, so the owner is kept. */
  validGitOwnerIds?: ReadonlySet<string>
  /** Folder roots, to re-anchor relativePath when a dropped git owner leaves it repo-relative. */
  ownerRoots?: Pick<AppState, 'folderWorkspaces'>
}

/** The status path of a tab whose relativePath is not its git owner's. */
export type StatusReconcileGitOptions = { gitRelativePathOf?: (file: OpenFile) => string }
