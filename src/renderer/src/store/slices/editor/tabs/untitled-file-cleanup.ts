import type { AppState } from '../../../types'
import type { OpenFile } from '../types/open-file'
import { mayShareEditorBackingFile } from '../file-ids/editor-file-ids'
import { findWorktreeById } from '../../worktree-helpers'
import { getEditorFileOperationContext } from '@/lib/editor-file-operation-owner'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { getDiskBaselineSignature } from '../../../../../../shared/disk-baseline-signature'
import {
  deleteRuntimePath,
  deleteRuntimeRelativePath
} from '@/runtime/runtime-file-mutation-client'
import { statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import { selectWorktreesByRepo } from '../../../workspace-record-selectors'

export function deleteUntouchedUntitledFile(getState: () => AppState, file: OpenFile): void {
  const hasRetainedView = () =>
    getState().openFiles.some((candidate) => mayShareEditorBackingFile(candidate, file))
  if (hasRetainedView()) {
    return
  }
  const state = getState()
  const worktree = findWorktreeById(selectWorktreesByRepo(state), file.worktreeId)
  const owningRuntimeEnvironmentId = file.runtimeEnvironmentId?.trim()
  let context: ReturnType<typeof getEditorFileOperationContext>
  try {
    context = getEditorFileOperationContext(state, file, worktree?.path ?? null)
  } catch {
    return
  }
  // Delete only still-empty placeholders; agents/external editors/paired clients may write unseen content.
  void statRuntimePath(context, file.filePath)
    .then(async (stat) => {
      if (stat.size !== 0 || hasRetainedView()) {
        return
      }
      const ownerRelativePath = resolveTabOwnerRelativePath(state, file, worktree?.path ?? null)
      const deletedRemotely =
        ownerRelativePath !== null && (await deleteRuntimeRelativePath(context, ownerRelativePath))
      if (!deletedRemotely && !owningRuntimeEnvironmentId && !hasRetainedView()) {
        await deleteRuntimePath(context, file.filePath)
      }
    })
    .catch(() => {})
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

const EMPTY_DISK_SIGNATURE = getDiskBaselineSignature('')

export function shouldDeleteUntouchedUntitledFile(
  file: OpenFile | undefined,
  hasDraft: boolean
): boolean {
  return (
    file?.isUntitled === true &&
    !file.isDirty &&
    !hasDraft &&
    file.deleteUntouchedOnClose !== false &&
    // Saved/reloaded content makes real notes; disk size also catches writes this window missed.
    (file.lastKnownDiskSignature === undefined ||
      file.lastKnownDiskSignature === EMPTY_DISK_SIGNATURE)
  )
}
