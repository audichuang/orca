// Fork-only: kept out of useEditorPanelFileContentLoader.ts, which sits at upstream's max-lines limit.
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import {
  getOpenFileGitRelativePath,
  getOpenFileGitWorktreeId
} from '@/store/slices/editor/git/open-file-git-owner'

/** Git owner a file read goes through: the requested one, else the open tab's, else the caller's. */
export function fileReadGitOwner(
  restoredOpenFile: OpenFile | undefined,
  worktreeId: string | undefined,
  relativePath: string | undefined,
  options: { gitWorktreeId?: string } | undefined
): { worktreeId: string | undefined; relativePath: string | undefined } {
  return {
    worktreeId:
      options?.gitWorktreeId ??
      (restoredOpenFile ? getOpenFileGitWorktreeId(restoredOpenFile) : worktreeId),
    relativePath: restoredOpenFile
      ? getOpenFileGitRelativePath(useAppStore.getState(), restoredOpenFile)
      : relativePath
  }
}

/** A folder tab bound to a repo also answers reads requested through that repo's owner and path. */
export function fileMatchesReadOwner(
  file: OpenFile,
  worktreeId: string | undefined,
  relativePath: string | undefined
): boolean {
  return (
    (worktreeId === undefined ||
      file.worktreeId === worktreeId ||
      getOpenFileGitWorktreeId(file) === worktreeId) &&
    (relativePath === undefined ||
      file.relativePath === relativePath ||
      getOpenFileGitRelativePath(useAppStore.getState(), file) === relativePath)
  )
}
