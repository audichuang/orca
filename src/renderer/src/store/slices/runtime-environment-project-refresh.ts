import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/types'
import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../../shared/execution-host'

const STARTUP_WORKTREE_RETRY_DELAYS_MS = [750, 3_000] as const

export type RuntimeEnvironmentProjectRefreshResult = {
  worktreesHydrated: boolean
}

// Why: per-repo worktree fetches run with lineage suppressed so the env's host
// lineage is fetched exactly once (against the correct host) instead of N+1
// times against the active host. Shared by both the repos-only refresh and the
// full replay+refresh primitive so repos are never fetched twice.
async function refreshRuntimeEnvironmentWorktreeLineage(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  repos: readonly Repo[],
  options?: { background?: boolean }
): Promise<boolean> {
  const background = options?.background
  const results = await Promise.all(
    repos.map(async (repo) =>
      store.getState().fetchWorktrees(repo.id, { skipLineageRefresh: true, background })
    )
  )
  await store.getState().refreshWorktreeLineageForRuntimeEnvironment(environmentId, { background })
  return results.every((authoritative) => authoritative === true)
}

// Why: light sidebar refresh — only the env's worktrees + scoped lineage, never
// replay/repos-rewrite (which the heavy primitive does and would race Connect).
// Internal catch keeps the effect's bare void-dispatch from rejecting.
export async function refreshRuntimeEnvironmentWorktrees(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  options?: { background?: boolean }
): Promise<void> {
  try {
    const hostId = toRuntimeExecutionHostId(environmentId)
    const repos = store.getState().repos.filter((repo) => getRepoExecutionHostId(repo) === hostId)
    await refreshRuntimeEnvironmentWorktreeLineage(store, environmentId, repos, options)
  } catch (err) {
    console.error(`Failed to refresh worktrees for runtime environment ${environmentId}:`, err)
  }
}

// Why: B1/B2/B3 centralized here. Every entry point that reconnects, switches
// to, or connects a runtime environment must replay pending tombstones and then
// refresh the env's project model in a fixed order:
//   replay → fetchProjectGroups → fetchRuntimeEnvironmentRepos →
//   fetchFolderWorkspaces → worktrees/lineage.
// Project model fetches route explicitly through environmentId. If they read
// the active host instead, connected non-active servers have repos/worktrees
// but no Projects sidebar groups until the user opens Add Project for that host.
// Repos are fetched AFTER groups so the tombstone repo/workspace filters see
// the freshly-fetched groups for live subtree recompute, and exactly once so
// the reconnect storm cannot double-fetch them.
export async function replayThenRefreshRuntimeEnvironment(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  options?: { background?: boolean }
): Promise<RuntimeEnvironmentProjectRefreshResult> {
  const background = options?.background
  await store.getState().replayPendingDeletionsForEnvironment(environmentId)
  await store.getState().fetchProjectGroups({ runtimeEnvironmentId: environmentId })
  const repos = await store.getState().fetchRuntimeEnvironmentRepos(environmentId, { background })
  await store.getState().fetchFolderWorkspaces({ runtimeEnvironmentId: environmentId })
  const worktreesHydrated = await refreshRuntimeEnvironmentWorktreeLineage(
    store,
    environmentId,
    repos,
    options
  )
  return { worktreesHydrated }
}

function scheduleStartupWorktreeRetry(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  attempt: number
): void {
  const delayMs = STARTUP_WORKTREE_RETRY_DELAYS_MS[attempt]
  if (delayMs === undefined) {
    return
  }
  globalThis.setTimeout(() => {
    void replayThenRefreshRuntimeEnvironment(store, environmentId, { background: true })
      .then((result) => {
        if (!result.worktreesHydrated) {
          scheduleStartupWorktreeRetry(store, environmentId, attempt + 1)
        }
      })
      .catch((err) => {
        console.error(`Failed to retry startup worktree hydration for ${environmentId}:`, err)
      })
  }, delayMs)
}

export async function hydrateStartupProjectModelHosts(
  store: Pick<StoreApi<AppState>, 'getState'>,
  options?: { background?: boolean }
): Promise<void> {
  // Why: local projects must exist in the global Projects model regardless of
  // the focused/default runtime server. Startup used to follow only the active
  // route, so local projects stayed hidden until Add Project focused Local.
  await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null })
  await store.getState().fetchRepos({ runtimeEnvironmentId: null })
  await store.getState().fetchFolderWorkspaces({ runtimeEnvironmentId: null })
  await store.getState().hydrateRuntimeEnvironmentStatuses()

  const state = store.getState()
  const connectedEnvironmentIds = state.runtimeEnvironments
    .filter((environment) => state.runtimeStatusByEnvironmentId.get(environment.id)?.status)
    .map((environment) => environment.id)

  for (const environmentId of connectedEnvironmentIds) {
    try {
      const result = await replayThenRefreshRuntimeEnvironment(store, environmentId, options)
      if (!result.worktreesHydrated) {
        // Why: remote servers can report repos before their worktree scan/session
        // data is ready. A later Add Project host switch reruns this path; this
        // bounded startup retry gives cold-connected hosts the same recovery.
        scheduleStartupWorktreeRetry(store, environmentId, 0)
      }
    } catch (err) {
      console.error(`Failed to hydrate startup project model for ${environmentId}:`, err)
    }
  }
}
