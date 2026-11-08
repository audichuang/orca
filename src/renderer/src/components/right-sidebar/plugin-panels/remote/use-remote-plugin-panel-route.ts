import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { usePluginPanelsStore } from '@/store/plugin-panels'
import { getActiveWorkspaceOwnerTarget } from '@/lib/resolved-worktree-execution-host'
import { getRuntimeEnvironmentDisplayName } from '@/store/repos/owner-routing'
import type { PluginHostCallOutcome } from '../../../../../../shared/plugins/frames/plugin-protocol'
import type { PanelActionCall } from '../../../plugins/frames/plugin-frame-host'
import {
  callRemotePanelAction,
  listRemotePlugins,
  openRemotePanelSession,
  remotePanelAvailability,
  type RemotePanelAvailability
} from './remote-plugin-panel-route'

export type RemotePluginPanelRoute =
  | { kind: 'local' }
  | {
      kind: 'remote'
      environmentId: string
      hostName: string
      status: 'loading' | 'unreachable' | RemotePanelAvailability['kind']
      availability: RemotePanelAvailability | null
      callHostMethod: (call: PanelActionCall) => Promise<PluginHostCallOutcome>
    }

/** Where this panel's host calls go: the paired server owning the focused workspace, else here. */
export function useRemotePluginPanelRoute(
  panel: { pluginKey: string; id: string; tabKey: string } | null
): RemotePluginPanelRoute {
  // Direct SSH and local workspaces resolve to no environment and keep this computer's plugins.
  const environmentId = useAppStore((state) => {
    const owner = getActiveWorkspaceOwnerTarget(state)
    return owner?.kind === 'environment' ? owner.environmentId : null
  })
  const hostName = useAppStore((state) =>
    environmentId ? getRuntimeEnvironmentDisplayName(state, environmentId) : ''
  )
  const pluginKey = panel?.pluginKey ?? null
  const panelId = panel?.id ?? null
  const tabKey = panel?.tabKey ?? null
  const localVersion = usePluginPanelsStore((state) =>
    environmentId
      ? (state.plugins.find((each) => each.pluginKey === pluginKey)?.version ?? null)
      : null
  )
  const [availability, setAvailability] = useState<{
    key: string
    value: RemotePanelAvailability | 'unreachable'
  } | null>(null)
  const tokenRef = useRef<string | null>(null)
  const routeKey = environmentId && tabKey ? `${environmentId}\0${tabKey}` : null

  useEffect(() => {
    tokenRef.current = null
    if (!environmentId || !pluginKey || !panelId || !tabKey || !routeKey) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const value = remotePanelAvailability(
          await listRemotePlugins(environmentId),
          tabKey,
          localVersion
        )
        if (value.kind === 'ready') {
          const token = await openRemotePanelSession(environmentId, pluginKey, panelId)
          if (!cancelled) {
            tokenRef.current = token
          }
        }
        if (!cancelled) {
          setAvailability({ key: routeKey, value })
        }
      } catch {
        if (!cancelled) {
          setAvailability({ key: routeKey, value: 'unreachable' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [environmentId, pluginKey, panelId, tabKey, routeKey, localVersion])

  const callHostMethod = useCallback(
    (call: PanelActionCall): Promise<PluginHostCallOutcome> => {
      if (!environmentId || !pluginKey || !panelId) {
        return Promise.resolve({ ok: false, code: 'unavailable', error: 'No remote host.' })
      }
      return callRemotePanelAction(environmentId, call, {
        current: () => tokenRef.current,
        reopen: async () => {
          tokenRef.current = await openRemotePanelSession(environmentId, pluginKey, panelId)
          return tokenRef.current
        }
      })
    },
    [environmentId, pluginKey, panelId]
  )

  if (!environmentId) {
    return { kind: 'local' }
  }
  const current = availability?.key === routeKey ? availability.value : null
  return {
    kind: 'remote',
    environmentId,
    hostName,
    status: current === null ? 'loading' : current === 'unreachable' ? current : current.kind,
    availability: current === null || current === 'unreachable' ? null : current,
    callHostMethod
  }
}
