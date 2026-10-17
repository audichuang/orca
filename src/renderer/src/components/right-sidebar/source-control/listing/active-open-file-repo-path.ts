import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'

type ActiveEditorFile = {
  filePath: string
  relativePath: string
  gitWorktreeId?: string
}

/**
 * The active editor file's path relative to this repo section, or null when the
 * file belongs to another repo. Folder workspaces share one editor across repo
 * sections, so a nested repo's file must not light up the outer repo's same-named row.
 */
export function resolveActiveFileRepoRelativePath(args: {
  file: ActiveEditorFile
  tabWorktreeId: string
  repoWorktreeId: string | null
  repoPath: string | null
}): string | null {
  const { file, tabWorktreeId, repoWorktreeId, repoPath } = args
  if (tabWorktreeId === repoWorktreeId) {
    return file.relativePath
  }
  if (file.gitWorktreeId) {
    return file.gitWorktreeId === repoWorktreeId ? file.relativePath : null
  }
  if (!repoPath) {
    return null
  }
  const relative = relativePathInsideRoot(repoPath, file.filePath)
  return relative ? relative.replace(/\\/g, '/') : null
}
