import type { AppState } from '../types'
import type { PendingProjectGroupDeletion } from '../../../../shared/types'
import { selectPendingDeletionsForEnvironment } from '../../../../shared/pending-project-group-deletions'
import { callRuntimeRpc, RuntimeRpcCallError } from '../../runtime/runtime-rpc-client'

// Why: serialise replays per-environment so rapid reconnect events cannot
// interleave partial-replay state for the same environment.
const replayLocksByEnvironment = new Map<string, Promise<void>>()

function isRepoNotFound(err: unknown): boolean {
  return err instanceof RuntimeRpcCallError && err.code === 'repo_not_found'
}

async function replaySingleTombstone(
  tombstone: PendingProjectGroupDeletion
): Promise<'cleared' | 'keep'> {
  const target = { kind: 'environment' as const, environmentId: tombstone.environmentId }

  if (tombstone.removeContainedProjects) {
    for (const repoId of tombstone.pendingProjectIds) {
      try {
        await callRuntimeRpc(target, 'repo.rm', { repo: repoId }, { timeoutMs: 15_000 })
      } catch (err) {
        // repo_not_found means the repo is already gone — treat as success
        if (!isRepoNotFound(err)) {
          // Transport failure: keep tombstone, skip group delete
          console.error(
            `[force-remove-replay] repo.rm failed for repo ${repoId}, keeping tombstone`,
            err
          )
          return 'keep'
        }
      }
    }
  }

  try {
    await callRuntimeRpc<{ deleted: boolean }>(
      target,
      'projectGroup.delete',
      { groupId: tombstone.groupId },
      { timeoutMs: 15_000 }
    )
    // Whether deleted:true or deleted:false, intent was fulfilled — clear tombstone
    return 'cleared'
  } catch (err) {
    console.error(
      `[force-remove-replay] projectGroup.delete failed for group ${tombstone.groupId}, keeping tombstone`,
      err
    )
    return 'keep'
  }
}

async function doReplay(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  environmentId: string
): Promise<void> {
  const tombstones = selectPendingDeletionsForEnvironment(
    get().pendingProjectGroupDeletions,
    environmentId
  )

  for (const tombstone of tombstones) {
    const outcome = await replaySingleTombstone(tombstone)
    if (outcome === 'cleared') {
      await window.api.pendingProjectGroupDeletions.remove({
        environmentId,
        groupId: tombstone.groupId
      })
      set((s) => ({
        pendingProjectGroupDeletions: s.pendingProjectGroupDeletions.filter(
          (t) => !(t.environmentId === environmentId && t.groupId === tombstone.groupId)
        )
      }))
    }
  }
}

export function replayPendingDeletionsForEnvironment(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  environmentId: string
): Promise<void> {
  const existing = replayLocksByEnvironment.get(environmentId)
  // Why: if a replay is already in-flight for this environment, chain after it
  // so reconnect-storm events don't produce interleaved replay state.
  const next = (existing ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => doReplay(get, set, environmentId))
    .finally(() => {
      if (replayLocksByEnvironment.get(environmentId) === next) {
        replayLocksByEnvironment.delete(environmentId)
      }
    })
  replayLocksByEnvironment.set(environmentId, next)
  return next
}
