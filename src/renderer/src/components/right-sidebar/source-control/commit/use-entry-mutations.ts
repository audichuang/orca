import { useCallback } from 'react'
import { requireGitOwnerTarget } from '../../worktree-git-owner-target'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import {
  notifyEditorExternalFileChange,
  requestEditorSaveQuiesce
} from '@/components/editor/editor-autosave'
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

// Why: a folder workspace's open tabs are owned by the folder key while git runs against the repo.
function editorOwnerIds(gitWorktreeId: string, editorWorktreeId: string | undefined): string[] {
  return editorWorktreeId && editorWorktreeId !== gitWorktreeId
    ? [gitWorktreeId, editorWorktreeId]
    : [gitWorktreeId]
}

function releaseAll(releases: (() => void)[]): void {
  for (const release of releases) {
    release()
  }
}

/** Takes every autosave hold or none: one path that can't be quiesced frees the holds the rest took. */
async function quiesceEditorSaves(
  targets: Parameters<typeof requestEditorSaveQuiesce>[0][]
): Promise<(() => void)[]> {
  const quiesced = await Promise.allSettled(targets.map(requestEditorSaveQuiesce))
  const releases = quiesced.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []
  )
  const failed = quiesced.find((result) => result.status === 'rejected')
  if (failed) {
    releaseAll(releases)
    throw failed.reason
  }
  return releases
}

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
  // Why: named function expression so the failure toast's Retry can re-enter the same attempt.
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
            // Why: route the mutation by the repo OWNER host, not the focused runtime.
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
      // Why: the mutation landed, so clear any failure this worktree's attempts left in the slot —
      // a failure another worktree raised meanwhile is not ours to dismiss.
      dismissSourceControlEntryFailureToast(activeWorktreeId)
      // Why: refreshing outside the try keeps a refresh failure from being reported as "Failed to stage"; the refresher reports its own.
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

  // Why: discardSingle throws so bulk callers can aggregate failures into one toast; the per-row caller reports its own.
  const discardSingle = useCallback(
    async (filePath: string) => {
      if (!worktreePath || !activeWorktreeId) {
        return
      }
      const runtimeEnvironmentId =
        activeRepoTarget?.kind === 'environment' ? activeRepoTarget.environmentId : null
      // Why: quiesce pending editor autosaves first so a delayed save can't recreate the discarded edits after git restores the file.
      const releases = await quiesceEditorSaves(
        editorOwnerIds(activeWorktreeId, editorWorktreeId).map((worktreeId) => ({
          worktreeId,
          worktreePath,
          relativePath: filePath,
          runtimeEnvironmentId
        }))
      )
      // Why finally: autosave of this file stays held, in every workspace, until git has finished.
      try {
        const connectionId = getConnectionId(activeWorktreeId) ?? undefined
        await discardRuntimeGitPath(
          {
            // Why: route the discard by the repo OWNER host, not the focused runtime.
            target: requireGitOwnerTarget(activeRepoTarget),
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          filePath
        )
        for (const worktreeId of editorOwnerIds(activeWorktreeId, editorWorktreeId)) {
          notifyEditorExternalFileChange({
            worktreeId,
            worktreePath,
            relativePath: filePath,
            runtimeEnvironmentId
          })
        }
      } finally {
        releaseAll(releases)
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
      // Why: quiesce matching editor autosaves first so a delayed save can't recreate edits after git mutates the files.
      const releases = await quiesceEditorSaves(
        editorOwnerIds(activeWorktreeId, editorWorktreeId).flatMap((worktreeId) =>
          filePaths.map((relativePath) => ({
            worktreeId,
            worktreePath,
            relativePath,
            runtimeEnvironmentId
          }))
        )
      )
      try {
        const connectionId = getConnectionId(activeWorktreeId) ?? undefined
        await bulkDiscardRuntimeGitPaths(
          {
            // Why: route the discard by the repo OWNER host, not the focused runtime.
            target: requireGitOwnerTarget(activeRepoTarget),
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          filePaths
        )
        for (const worktreeId of editorOwnerIds(activeWorktreeId, editorWorktreeId)) {
          for (const relativePath of filePaths) {
            notifyEditorExternalFileChange({
              worktreeId,
              worktreePath,
              relativePath,
              runtimeEnvironmentId
            })
          }
        }
      } finally {
        releaseAll(releases)
      }
    },
    [activeRepoTarget, activeWorktreeId, editorWorktreeId, worktreePath]
  )

  return { handleStage, handleUnstage, discardSingle, discardMany }
}
