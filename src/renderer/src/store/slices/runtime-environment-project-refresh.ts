import type { StoreApi } from 'zustand'
import type { AppState } from '../types'

// Why: the single shared env-scoped refresh primitive — one host-correct
// lineage fetch per round. Per-repo worktree fetches run with lineage
// suppressed so the env's host lineage is fetched exactly once (against the
// correct host) instead of N+1 times against the active host.
export async function refreshRuntimeEnvironmentProjects(
  store: Pick<StoreApi<AppState>, 'getState'>,
  environmentId: string,
  options?: { background?: boolean }
): Promise<void> {
  const background = options?.background
  const repos = await store.getState().fetchRuntimeEnvironmentRepos(environmentId, { background })
  await Promise.all(
    repos.map((repo) =>
      store.getState().fetchWorktrees(repo.id, { skipLineageRefresh: true, background })
    )
  )
  await store.getState().refreshWorktreeLineageForRuntimeEnvironment(environmentId, { background })
}
