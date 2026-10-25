import { useCallback } from 'react'
import { requireGitOwnerTarget } from '../../worktree-git-owner-target'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import {
  notifyEditorExternalFileChangeForOwners,
  requestEditorSaveQuiesceForOwners
} from '../folder/repo-editor-owner-save-holds'
import { getConnectionId } from '@/lib/connection-context'
import { basename } from '@/lib/path'
import { useSourceControlWorktreeScope } from '../folder/worktree-scope'
import {
  bulkDiscardRuntimeGitPaths,
  bulkUnstageRuntimeGitPaths,
  discardRuntimeGitPath,
  stageRuntimeGitPath,
  unstageRuntimeGitPath
} from '@/runtime/runtime-git-working-tree-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import {
  dismissSourceControlEntryFailureToast,
  showSourceControlEntryFailureToast
} from './source-control-entry-failure-toast'

export function useSourceControlEntryMutations({
  activeRepoTarget,
  activeWorktreeId,
  worktreePath,
  refreshActiveGitStatusAfterMutation
}: {
  activeRepoTarget: RuntimeClientTarget | null
  activeWorktreeId: string | null
  worktreePath: string | null
  refreshActiveGitStatusAfterMutation: () => Promise<void>
}) {
  const editorWorktreeId = useSourceControlWorktreeScope()?.editorWorktreeId
  // Name the callback so Retry can reenter the same attempt.
  const runEntryMutation = useCallback(
    async function runEntryMutation(
      operation: 'stage' | 'unstage',
      filePath: string,
      mutate: (context: RuntimeGitContext, filePath: string) => Promise<void>
    ): Promise<void> {
      if (!worktreePath) {
        return
      }
      try {
        const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
        await mutate(
          {
            // Route mutations through workspace ownership rather than focused runtime.
            target: requireGitOwnerTarget(activeRepoTarget),
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          filePath
        )
      } catch (error) {
        console.error(`[SourceControl] ${operation} failed`, error)
        showSourceControlEntryFailureToast({
          operation,
          filePath,
          error,
          worktreeId: activeWorktreeId,
          worktreeName: worktreePath ? basename(worktreePath) : null,
          foregroundWorkspaceId: editorWorktreeId,
          onRetry: () => {
            void runEntryMutation(operation, filePath, mutate)
          }
        })
        return
      }
      // Clear only this worktree's failure slot; another worktree may have filled it while this attempt ran.
      dismissSourceControlEntryFailureToast(activeWorktreeId)
      // Refresh outside the mutation catch so its errors cannot be mislabeled as stage failures.
      await refreshActiveGitStatusAfterMutation()
    },
    [
      activeRepoTarget,
      worktreePath,
      activeWorktreeId,
      editorWorktreeId,
      refreshActiveGitStatusAfterMutation
    ]
  )

  const handleStage = useCallback(
    (filePath: string): Promise<void> => runEntryMutation('stage', filePath, stageRuntimeGitPath),
    [runEntryMutation]
  )

  const handleUnstage = useCallback(
    (filePath: string, oldPath?: string): Promise<void> =>
      runEntryMutation(
        'unstage',
        filePath,
        oldPath
          ? (context, path) => bulkUnstageRuntimeGitPaths(context, [path, oldPath])
          : unstageRuntimeGitPath
      ),
    [runEntryMutation]
  )

  // Throw for bulk callers to aggregate; per-row callers report their own failures.
  const discardSingle = useCallback(
    async (filePath: string) => {
      if (!worktreePath || !activeWorktreeId) {
        return
      }
      const runtimeEnvironmentId =
        activeRepoTarget?.kind === 'environment' ? activeRepoTarget.environmentId : null
      // Hold pending autosaves so delayed writes cannot recreate edits after Git restores the file.
      const targets = [
        { worktreeId: activeWorktreeId, worktreePath, relativePath: filePath, runtimeEnvironmentId }
      ]
      const releaseAutoSave = await requestEditorSaveQuiesceForOwners(editorWorktreeId, targets)
      // Release in finally so every workspace holds autosave until Git finishes.
      try {
        const connectionId = getConnectionId(activeWorktreeId) ?? undefined
        await discardRuntimeGitPath(
          {
            // Route discard through workspace ownership rather than focused runtime.
            target: requireGitOwnerTarget(activeRepoTarget),
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          filePath
        )
        notifyEditorExternalFileChangeForOwners(editorWorktreeId, targets)
      } finally {
        releaseAutoSave()
      }
    },
    [activeRepoTarget, activeWorktreeId, editorWorktreeId, worktreePath]
  )

  const discardMany = useCallback(
    async (filePaths: string[]) => {
      if (!worktreePath || !activeWorktreeId) {
        return
      }
      const runtimeEnvironmentId =
        activeRepoTarget?.kind === 'environment' ? activeRepoTarget.environmentId : null
      // Quiesce matching editors so delayed autosaves cannot recreate edits after Git mutates files.
      const targets = filePaths.map((relativePath) => ({
        worktreeId: activeWorktreeId,
        worktreePath,
        relativePath,
        runtimeEnvironmentId
      }))
      const releaseAutoSaves = await requestEditorSaveQuiesceForOwners(editorWorktreeId, targets)
      try {
        const connectionId = getConnectionId(activeWorktreeId) ?? undefined
        await bulkDiscardRuntimeGitPaths(
          {
            // Route discard through workspace ownership rather than focused runtime.
            target: requireGitOwnerTarget(activeRepoTarget),
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          filePaths
        )
        notifyEditorExternalFileChangeForOwners(editorWorktreeId, targets)
      } finally {
        releaseAutoSaves()
      }
    },
    [activeRepoTarget, activeWorktreeId, editorWorktreeId, worktreePath]
  )

  return { handleStage, handleUnstage, discardSingle, discardMany }
}
