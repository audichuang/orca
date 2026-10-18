import type { AppState } from '../../../types'
import type { OpenFile } from '../types/open-file'
import { getIndexedWorktreesById } from '../../../worktree-repo-index'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'

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
  for (const worktree of getIndexedWorktreesById(state.worktreesByRepo, file.gitWorktreeId)) {
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
  file: Pick<OpenFile, 'gitWorktreeId' | 'worktreeId' | 'relativePath' | 'filePath'>,
  worktreePath: string | null
): string | null {
  if (!file.gitWorktreeId || file.gitWorktreeId === file.worktreeId) {
    return file.relativePath
  }
  const scope = parseWorkspaceKey(file.worktreeId)
  const ownerRoot =
    scope?.type === 'folder'
      ? (state.folderWorkspaces?.find((w) => w.id === scope.folderWorkspaceId)?.folderPath ?? null)
      : worktreePath
  return ownerRoot ? relativePathInsideRoot(ownerRoot, file.filePath) : null
}

/** Tab-id prefix: repos sharing one folder editor must not collide on identical relative paths. */
export function getScopedTabIdOwner(worktreeId: string, gitWorktreeId?: string): string {
  return gitWorktreeId && gitWorktreeId !== worktreeId
    ? `${worktreeId}@${gitWorktreeId}`
    : worktreeId
}
