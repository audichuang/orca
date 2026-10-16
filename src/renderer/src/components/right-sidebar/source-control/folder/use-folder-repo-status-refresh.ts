import { useCallback, useEffect, useRef } from 'react'
import { getConnectionId } from '@/lib/connection-context'
import { isWindowVisible } from '@/lib/window-visibility-interval'
import { useAppStore } from '@/store'
import {
  ORCA_EDITOR_FILE_SAVED_EVENT,
  type EditorFileSavedDetail
} from '@/components/editor/editor-autosave'
import { isPathInsideOrEqual } from '../../../../../../shared/cross-platform-path'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { refreshGitStatusForWorktree } from '../../git-status-refresh'
import { getWorktreeGitOwnerTarget } from '../../worktree-git-owner-target'

export const FOLDER_REPO_STATUS_INTERVAL_MS = 20_000
const REPO_NUDGE_DEBOUNCE_MS = 400

/**
 * Keeps git status fresh for every repo listed in a folder workspace. App-wide polling only
 * covers the active worktree, and a folder workspace is never a git worktree itself.
 * Returns a manual refresh-all trigger.
 */
export function useFolderRepoStatusRefresh(
  worktrees: readonly Worktree[],
  enabled: boolean
): () => Promise<void> {
  const worktreesRef = useRef(worktrees)
  // Declared before the polling effects so they read the latest members on the same commit.
  useEffect(() => {
    worktreesRef.current = worktrees
  }, [worktrees])
  const runningRef = useRef(false)

  const refreshOne = useCallback(async (worktree: Worktree, periodic = false): Promise<void> => {
    const state = useAppStore.getState()
    const connectionId = getConnectionId(worktree.id) ?? undefined
    const target = getWorktreeGitOwnerTarget(worktree.id)
    if (!target) {
      return
    }
    // Why: a paired server's SSH target lives in that server's state, not this client's map.
    const connectionReady =
      !connectionId ||
      target.kind === 'environment' ||
      state.sshConnectionStates.get(connectionId)?.status === 'connected'
    // Why: a huge repo pauses evidence-free polling only; explicit refreshes and change signals still probe so it can recover.
    if (!connectionReady || (periodic && state.gitStatusHugeByWorktree?.[worktree.id])) {
      return
    }
    await refreshGitStatusForWorktree({
      target,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      connectionId,
      pushTarget: worktree.pushTarget,
      deps: {
        setGitStatus: state.setGitStatus,
        updateWorktreeGitIdentity: state.updateWorktreeGitIdentity,
        setUpstreamStatus: state.setUpstreamStatus,
        fetchUpstreamStatus: state.fetchUpstreamStatus
      },
      request: { admissionTier: 'background' }
    }).catch((error: unknown) => {
      console.warn('[SourceControl] folder repo status refresh failed', worktree.path, error)
    })
  }, [])

  const refreshAll = useCallback(
    async (periodic = false): Promise<void> => {
      if (runningRef.current || !isWindowVisible()) {
        return
      }
      runningRef.current = true
      try {
        // ponytail: one repo at a time on the background tier; add a concurrency cap if folders hold dozens of repos.
        for (const worktree of worktreesRef.current) {
          await refreshOne(worktree, periodic)
        }
      } finally {
        runningRef.current = false
      }
    },
    [refreshOne]
  )

  const worktreeKey = worktrees.map((worktree) => worktree.id).join('\0')
  useEffect(() => {
    if (!enabled || worktreeKey === '') {
      return
    }
    void refreshAll()
    const timer = setInterval(() => void refreshAll(true), FOLDER_REPO_STATUS_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [enabled, refreshAll, worktreeKey])

  // Why: app-wide watchers only follow the active worktree, which is the folder itself here; nudge the
  // member repo that an editor save or a git metadata change touched instead of waiting for the poll.
  useEffect(() => {
    if (!enabled || worktreeKey === '') {
      return
    }
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const nudge = (worktree: Worktree): void => {
      clearTimeout(timers.get(worktree.id))
      timers.set(
        worktree.id,
        setTimeout(() => {
          timers.delete(worktree.id)
          if (isWindowVisible()) {
            void refreshOne(worktree)
          }
        }, REPO_NUDGE_DEBOUNCE_MS)
      )
    }
    const onFileSaved = (event: Event): void => {
      const detail: Partial<EditorFileSavedDetail> | undefined =
        event instanceof CustomEvent ? event.detail : undefined
      const fileId = detail?.fileId
      const filePath = useAppStore.getState().openFiles.find((file) => file.id === fileId)?.filePath
      if (!filePath) {
        return
      }
      // Longest root wins so a repo nested inside another repo owns its own files.
      const owner = worktreesRef.current
        .filter((worktree) => isPathInsideOrEqual(worktree.path, filePath))
        .sort((a, b) => b.path.length - a.path.length)[0]
      if (owner) {
        nudge(owner)
      }
    }
    const onRepoSignal = ({ repoId }: { repoId: string }): void => {
      for (const worktree of worktreesRef.current) {
        if (worktree.repoId === repoId) {
          nudge(worktree)
        }
      }
    }
    window.addEventListener(ORCA_EDITOR_FILE_SAVED_EVENT, onFileSaved)
    const unsubs = [
      window.api?.worktrees?.onChanged?.(onRepoSignal),
      window.api?.worktrees?.onGitStatusMetadataChanged?.(onRepoSignal)
    ].filter((unsubscribe): unsubscribe is () => void => typeof unsubscribe === 'function')
    return () => {
      window.removeEventListener(ORCA_EDITOR_FILE_SAVED_EVENT, onFileSaved)
      for (const unsubscribe of unsubs) {
        unsubscribe()
      }
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
    }
  }, [enabled, refreshOne, worktreeKey])

  return useCallback(() => refreshAll(), [refreshAll])
}
