// Why: renderer-local, non-persisted view-staleness bookkeeping for non-active
// runtime environments. Deliberately NOT in the Zustand store — it is not UI
// state and must not trigger re-renders. A non-active env's reposChanged/
// worktreesChanged marks it dirty instead of running the heavy refresh; the
// active-server switch hydrate clears it.
const dirtyRuntimeEnvironmentIds = new Set<string>()

export function markRuntimeEnvironmentDirty(environmentId: string): void {
  dirtyRuntimeEnvironmentIds.add(environmentId)
}

export function clearRuntimeEnvironmentDirty(environmentId: string): void {
  dirtyRuntimeEnvironmentIds.delete(environmentId)
}

export function isRuntimeEnvironmentDirty(environmentId: string): boolean {
  return dirtyRuntimeEnvironmentIds.has(environmentId)
}
