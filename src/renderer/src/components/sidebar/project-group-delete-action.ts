import type { ProjectGroup } from '../../../../shared/types'
import type { AppState } from '@/store/types'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import type { RuntimeEnvironmentStatus } from '@/store/slices/runtime-status'

type DeleteActionInput = {
  group: ProjectGroup | undefined
  settings: AppState['settings']
  runtimeStatusByEnvironmentId: Map<string, RuntimeEnvironmentStatus>
}

/** The action the delete handler should take for a given group+state combination. */
export type ProjectGroupDeleteAction = 'force-remove-locally' | 'online-delete'

/**
 * Resolves whether the delete handler should skip the remote call and force-remove
 * the group locally or fall through to the normal online delete path.
 *
 * Why: the offline fast-path is only safe when the target group is actually owned by
 * the active environment — not whenever *any* environment happens to be offline.
 * A group owned by env-B must still go through the normal path even if env-A (active)
 * is currently unreachable.
 */
export function resolveProjectGroupDeleteAction({
  group,
  settings,
  runtimeStatusByEnvironmentId
}: DeleteActionInput): ProjectGroupDeleteAction {
  const target = getActiveRuntimeTarget(settings)
  // Only a runtime environment can be "offline" in the relevant sense.
  if (target.kind !== 'environment') {
    return 'online-delete'
  }

  const runtimeHostId = toRuntimeExecutionHostId(target.environmentId)
  // The group must belong to the active environment to qualify for the fast-path.
  if (group?.executionHostId !== runtimeHostId) {
    return 'online-delete'
  }

  const entry = runtimeStatusByEnvironmentId.get(target.environmentId)
  // Absent entry = never probed; null status = probe failed — both mean offline.
  const isOffline = !entry || entry.status === null
  return isOffline ? 'force-remove-locally' : 'online-delete'
}
