import type { RuntimeEnvironmentStatus } from '../../store/slices/runtime-status'

// Why: a host is "ready to refresh" only when its graph is ready — a mere status
// entry (reloading/unavailable, or a null failed-probe) cannot answer worktree
// RPCs yet, so refreshing then would waste calls or fail.
export function readyRuntimeEnvironmentIds(
  statusByEnvironmentId: ReadonlyMap<string, RuntimeEnvironmentStatus> | null | undefined
): string[] {
  return [...(statusByEnvironmentId?.entries() ?? [])]
    .filter(([, entry]) => entry?.status?.graphStatus === 'ready')
    .map(([id]) => id)
    .sort()
}

// Why: only hosts that NEWLY entered the ready set need a refresh. Hosts that
// left are omitted (an offline host cannot be refreshed; surviving peers need
// nothing when one drops). A null previous (first run) yields [] so startup
// hydration (hydrateStartupProjectModelHosts) owns the initial set. Diffing by
// Set membership avoids any joined-string separator collision.
export function newlyReadyEnvironmentIds(
  previousIds: readonly string[] | null,
  nextIds: readonly string[]
): string[] {
  if (previousIds === null) {
    return []
  }
  const previous = new Set(previousIds)
  return nextIds.filter((id) => !previous.has(id))
}
