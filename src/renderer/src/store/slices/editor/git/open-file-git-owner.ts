import type { AppState } from '../../../types'
import type { EditorOpenTargetOptions, OpenFile } from '../types/open-file'
import { getIndexedWorktreesById } from '../../../worktree-repo-index'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../../../shared/execution-host'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'

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
  const scope = parseWorkspaceKey(file.worktreeId)
  if (scope?.type !== 'folder') {
    return worktreePath ? relativePathInsideRoot(worktreePath, file.filePath) : null
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
    const relativePath = relativePathInsideRoot(workspace.folderPath, file.filePath)
    if (relativePath) {
      candidates.add(relativePath)
    }
  }
  return candidates.size === 1 ? [...candidates][0] : null
}

/** Tab-id prefix: repos sharing one folder editor must not collide on identical relative paths. */
export function getScopedTabIdOwner(worktreeId: string, gitWorktreeId?: string): string {
  return gitWorktreeId && gitWorktreeId !== worktreeId
    ? `${worktreeId}@${gitWorktreeId}`
    : worktreeId
}

/** Tab id of a commit diff; the cross-file diff navigation looks its file list up by it. */
export function commitDiffTabId(
  worktreeId: string,
  gitWorktreeId: string | undefined,
  compareVersion: string,
  relativePath: string
): string {
  return `${getScopedTabIdOwner(worktreeId, gitWorktreeId)}::diff::commit::${compareVersion}::${relativePath}`
}

/** Fork options of an editor open: the repo whose git state backs a folder workspace's tab. */
export type GitOwnerOpenOptions = Pick<EditorOpenTargetOptions, 'gitWorktreeId'>

/** The tab's git owner, or undefined when it is the tab's own workspace. */
export function resolveOpenGitWorktreeId(
  worktreeId: string,
  options: GitOwnerOpenOptions | undefined
): string | undefined {
  return options?.gitWorktreeId !== worktreeId ? options?.gitWorktreeId : undefined
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
