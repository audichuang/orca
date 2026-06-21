import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/types'

// Why: per-repo worktree fetches run with lineage suppressed so the env's host
// lineage is fetched exactly once (against the correct host) instead of N+1
// times against the active host. Shared by both the repos-only refresh and the
// full replay+refresh primitive so repos are never fetched twice.
async function refreshRuntimeEnvironmentWorktreeLineage(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  repos: readonly Repo[],
  options?: { background?: boolean }
): Promise<void> {
  const background = options?.background
  await Promise.all(
    repos.map((repo) =>
      store.getState().fetchWorktrees(repo.id, { skipLineageRefresh: true, background })
    )
  )
  await store.getState().refreshWorktreeLineageForRuntimeEnvironment(environmentId, { background })
}

// Why: B1/B2/B3 centralized here. Every entry point that reconnects, switches
// to, or connects a runtime environment must replay pending tombstones and then
// refresh the full project model in a fixed order:
//   replay → fetchProjectGroups → fetchRuntimeEnvironmentRepos →
//   fetchFolderWorkspaces → worktrees/lineage.
// Repos are fetched AFTER groups so the tombstone repo/workspace filters can see
// the freshly-fetched groups for live subtree recompute, and exactly once so the
// reconnect storm cannot double-fetch them.
export async function replayThenRefreshRuntimeEnvironment(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  options?: { background?: boolean }
): Promise<void> {
  const background = options?.background
  await store.getState().replayPendingDeletionsForEnvironment(environmentId)
  await store.getState().fetchProjectGroups()
  const repos = await store.getState().fetchRuntimeEnvironmentRepos(environmentId, { background })
  await store.getState().fetchFolderWorkspaces()
  await refreshRuntimeEnvironmentWorktreeLineage(store, environmentId, repos, options)
}
