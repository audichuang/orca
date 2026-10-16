import type { OpenFile } from '../types/open-file'

/** Worktree whose git state backs a tab; differs from the tab owner for folder-workspace repo sections. */
export function getOpenFileGitWorktreeId(
  file: Pick<OpenFile, 'worktreeId' | 'gitWorktreeId'>
): string {
  return file.gitWorktreeId ?? file.worktreeId
}

/** Tab-id prefix: repos sharing one folder editor must not collide on identical relative paths. */
export function getScopedTabIdOwner(worktreeId: string, gitWorktreeId?: string): string {
  return gitWorktreeId && gitWorktreeId !== worktreeId
    ? `${worktreeId}@${gitWorktreeId}`
    : worktreeId
}
