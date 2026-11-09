import { useAppStore } from '@/store'
import { folderOwnerRelativePath } from '@/store/slices/editor/tabs/folder-tab-relative-path'
import { selectFolderWorkspaces } from '@/store/workspaces/catalog/workspace-record-fields'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'

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
  const folderRelative = folderOwnerRelativePath(
    { folderWorkspaces },
    { worktreeId, filePath, runtimeEnvironmentId }
  )
  if (folderRelative !== null) {
    return folderRelative
  }
  // Why: a parent-repo file outside the folder has no folder-relative path; its repo-relative one would resolve inside the folder.
  return parseWorkspaceKey(worktreeId)?.type === 'folder' ? filePath : relativePath
}
