import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/types'
import { getActiveRuntimeTarget } from '../../runtime/runtime-rpc-client'

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
// refresh the env's project model in a fixed order:
//   replay → [if active] fetchProjectGroups → fetchRuntimeEnvironmentRepos →
//   [if active] fetchFolderWorkspaces → worktrees/lineage.
// Replay and the env-scoped repos/worktrees/lineage ALWAYS run (env-coherent).
// fetchProjectGroups/fetchFolderWorkspaces read the ACTIVE runtime target rather
// than environmentId, so they run ONLY when environmentId is the active env —
// otherwise a Connect of a non-active env (B3-Connect) would re-fetch the wrong
// host's groups/workspaces (the old Connect refresh never touched them).
//   - switch / reconnect-of-active → active → full refresh.
//   - Connect of a non-active env → replay + env repos/worktrees/lineage only.
// Repos are fetched AFTER groups (when active) so the tombstone repo/workspace
// filters see the freshly-fetched groups for live subtree recompute, and exactly
// once so the reconnect storm cannot double-fetch them.
export async function replayThenRefreshRuntimeEnvironment(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  options?: { background?: boolean }
): Promise<void> {
  const background = options?.background
  await store.getState().replayPendingDeletionsForEnvironment(environmentId)
  const activeTarget = getActiveRuntimeTarget(store.getState().settings)
  const isActive =
    activeTarget.kind === 'environment' && activeTarget.environmentId === environmentId
  if (isActive) {
    await store.getState().fetchProjectGroups()
  }
  const repos = await store.getState().fetchRuntimeEnvironmentRepos(environmentId, { background })
  if (isActive) {
    await store.getState().fetchFolderWorkspaces()
  }
  await refreshRuntimeEnvironmentWorktreeLineage(store, environmentId, repos, options)
}
