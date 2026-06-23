import React, { useEffect } from 'react'
import { useAppStore } from '@/store'
import { refreshRuntimeEnvironmentWorktrees } from '@/store/slices/runtime-environment-project-refresh'
import {
  newlyReadyEnvironmentIds,
  readyRuntimeEnvironmentIds
} from './online-runtime-environment-delta'

// Why: a runtime host becoming graph-ready after startup (notably auto-reconnect)
// is refreshed by nothing else — startup hydration only covers startup-time hosts,
// and Connect/switch are manual. Refresh ONLY the newly-ready host(s), host-scoped.
export function useRuntimeEnvironmentReadyRefresh(): void {
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const readyRuntimeEnvIds = React.useMemo(
    () => readyRuntimeEnvironmentIds(runtimeStatusByEnvironmentId),
    [runtimeStatusByEnvironmentId]
  )
  const previousReadyRuntimeEnvIdsRef = React.useRef<readonly string[] | null>(null)
  useEffect(() => {
    // First run yields [] (helper handles null previous), handing the initial set to
    // hydrateStartupProjectModelHosts. A status-map ref change with an unchanged
    // ready-set re-runs this effect but yields no `added`, so it dispatches nothing.
    const added = newlyReadyEnvironmentIds(
      previousReadyRuntimeEnvIdsRef.current,
      readyRuntimeEnvIds
    )
    previousReadyRuntimeEnvIdsRef.current = readyRuntimeEnvIds
    for (const environmentId of added) {
      void refreshRuntimeEnvironmentWorktrees(useAppStore, environmentId)
    }
  }, [readyRuntimeEnvIds])
}
