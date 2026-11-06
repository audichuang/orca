import { useAppStore } from '@/store'
import { folderOwnerRelativePath } from '@/store/slices/editor/git/open-file-git-owner'
import { selectFolderWorkspaces } from '@/store/workspace-record-selectors'

/** Path an Add to chat quote names: a folder tab's file relative to the folder the chat opens in, not to its repo. */
export function useChatQuoteRelativePath(
  worktreeId: string | null | undefined,
  filePath: string,
  runtimeEnvironmentId: string | null | undefined,
  relativePath: string | null
): string | null {
  const folderWorkspaces = useAppStore(selectFolderWorkspaces)
  if (relativePath === null || !worktreeId) {
    return relativePath
  }
  return (
    folderOwnerRelativePath({ folderWorkspaces }, { worktreeId, filePath, runtimeEnvironmentId }) ??
    relativePath
  )
}
