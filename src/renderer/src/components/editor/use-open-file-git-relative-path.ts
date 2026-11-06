import { useAppStore } from '@/store'
import { getOpenFileGitRelativePath } from '@/store/slices/editor/git/open-file-git-owner'
import type { OpenFile } from '@/store/slices/editor'

/** Repo-relative path of a tab, for matching git status entries and repo-scoped notes. */
export function useOpenFileGitRelativePath(
  file: Pick<OpenFile, 'worktreeId' | 'gitWorktreeId' | 'filePath' | 'relativePath'> | null
): string | undefined {
  return useAppStore((state) => (file ? getOpenFileGitRelativePath(state, file) : undefined))
}
