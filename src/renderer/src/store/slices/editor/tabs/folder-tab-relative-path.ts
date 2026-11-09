import type { AppState } from '@/store/types'
import type { OpenFile } from '../types/open-file'
import { selectFolderWorkspaces } from '@/store/workspaces/catalog/workspace-record-fields'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'

type FolderRootsState = Pick<AppState, 'folderWorkspaces'>
type FolderTab = Pick<OpenFile, 'worktreeId' | 'filePath' | 'runtimeEnvironmentId'>

/** Roots of the tab's folder owner on the tab's host; null when the owner is no folder. */
function folderOwnerRoots(state: FolderRootsState, file: FolderTab): string[] | null {
  const scope = parseWorkspaceKey(file.worktreeId)
  if (scope?.type !== 'folder') {
    return null
  }
  // Why: hosts can share a folder id with different (even nested) roots; only the tab's host's root can own it.
  const runtimeHostId = file.runtimeEnvironmentId
    ? toRuntimeExecutionHostId(file.runtimeEnvironmentId)
    : null
  const roots = new Set<string>()
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
    roots.add(workspace.folderPath)
  }
  return [...roots]
}

/** filePath relative to the root of its folder tab owner on the tab's host; null when the owner is no folder or the root is ambiguous. */
export function folderOwnerRelativePath(state: FolderRootsState, file: FolderTab): string | null {
  const holding = (folderOwnerRoots(state, file) ?? []).filter(
    (root) => relativePathInsideRoot(root, file.filePath) !== null
  )
  return holding.length === 1 ? relativePathInsideRoot(holding[0], file.filePath) : null
}

/** A restored folder tab's path in upstream's shape: folder-relative, or absolute outside the folder root. */
export function restoredFolderTabRelativePath(
  state: FolderRootsState,
  file: FolderTab & Pick<OpenFile, 'relativePath'>
): string {
  if (!folderOwnerRoots(state, file)?.length) {
    return file.relativePath
  }
  return folderOwnerRelativePath(state, file) ?? file.filePath
}
