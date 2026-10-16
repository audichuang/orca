import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { getSettingsForWorktreeRuntimeOwner } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'

export function getRightSidebarWorktreeRuntimeSettings(
  worktreeId: string | null | undefined
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> {
  const store = useAppStore.getState()
  // Why: right-sidebar file/git actions operate on the selected workspace.
  // Route by that workspace owner so global focused-host changes cannot retarget them.
  return getSettingsForWorktreeRuntimeOwner(store, worktreeId)
}

export function getRightSidebarWorktreeOwnerSettings(
  worktreeId: string | null | undefined
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> {
  // Why: folder members are never the active worktree; blank focus so the legacy single-runtime fallback can't claim a local repo.
  return getSettingsForWorktreeRuntimeOwner(
    { ...useAppStore.getState(), settings: null },
    worktreeId
  )
}
