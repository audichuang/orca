import type { AppState } from '../types'
import type { PendingProjectGroupDeletion } from '../../../../shared/types'
import { selectPendingDeletionsForEnvironment } from '../../../../shared/pending-project-group-deletions'
import { callRuntimeRpc, RuntimeRpcCallError } from '../../runtime/runtime-rpc-client'

// Why: serialise replays per-environment so rapid reconnect events cannot
// interleave partial-replay state for the same environment.
const replayLocksByEnvironment = new Map<string, Promise<void>>()

// Why: an app-level error means the daemon responded (callRuntimeRpc throws a
// RuntimeRpcCallError on { ok:false }); a transport/timeout failure rejects with
// any other error. Only transport failures are worth retrying — an app error is
// terminal and must not deadlock the tombstone in an infinite retry loop.
function isAppLevelError(err: unknown): err is RuntimeRpcCallError {
  return err instanceof RuntimeRpcCallError
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
        if (err instanceof RuntimeRpcCallError && err.code === 'repo_not_found') {
          // Repo already gone — idempotent success.
          continue
        }
        if (isAppLevelError(err)) {
          // Daemon responded with an app error (e.g. repo locked). This is
          // terminal: log it but keep going so the group delete still detaches
          // the repo and the tombstone can clear — the user's intent was to
          // remove the group, not to retry this repo forever.
          console.warn(
            `[force-remove-replay] repo.rm rejected by daemon for repo ${repoId} (${err.code}); proceeding with group delete`,
            err
          )
          continue
        }
        // Transport/timeout failure: daemon never responded. Keep the tombstone
        // and skip the group delete so the next reconnect retries.
        console.error(
          `[force-remove-replay] repo.rm transport failure for repo ${repoId}, keeping tombstone`,
          err
        )
        return 'keep'
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
    if (isAppLevelError(err)) {
      // Daemon responded (group already gone / rejected). Clear the tombstone
      // rather than retry an app error forever.
      console.warn(
        `[force-remove-replay] projectGroup.delete rejected by daemon for group ${tombstone.groupId} (${err.code}); clearing tombstone`,
        err
      )
      return 'cleared'
    }
    // Transport/timeout failure: keep the tombstone and retry on next reconnect.
    console.error(
      `[force-remove-replay] projectGroup.delete transport failure for group ${tombstone.groupId}, keeping tombstone`,
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

export function doReplayPendingDeletions(
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
