import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
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

// Why retry: the server may still be connecting at startup, or the plugin installed there later.
const RETRY_MS = 10_000

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
  // Tagged with its server so a late reply for the previous host never becomes this host's token.
  const sessionRef = useRef<{ environmentId: string; token: string | null } | null>(null)
  const routeKey = environmentId && tabKey ? `${environmentId}\0${tabKey}` : null

  useEffect(() => {
    if (!environmentId || !pluginKey || !panelId || !tabKey || !routeKey) {
      return
    }
    let cancelled = false
    let ready = false
    const check = async (): Promise<void> => {
      try {
        const value = remotePanelAvailability(
          await listRemotePlugins(environmentId),
          tabKey,
          localVersion
        )
        const token =
          value.kind === 'ready'
            ? await openRemotePanelSession(environmentId, pluginKey, panelId)
            : null
        if (!cancelled) {
          sessionRef.current = { environmentId, token }
          ready = value.kind === 'ready'
          setAvailability({ key: routeKey, value })
        }
      } catch {
        if (!cancelled) {
          ready = false
          setAvailability({ key: routeKey, value: 'unreachable' })
        }
      }
    }
    const stop = installWindowVisibilityTimeoutPoller({
      run: check,
      getDelayMs: () => (ready ? null : RETRY_MS)
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [environmentId, pluginKey, panelId, tabKey, routeKey, localVersion])

  const callHostMethod = useCallback(
    (call: PanelActionCall): Promise<PluginHostCallOutcome> => {
      // Only handed to the frame on a remote route, where all three are set.
      const env = environmentId ?? ''
      const owned = (): string | null =>
        sessionRef.current?.environmentId === env ? sessionRef.current.token : null
      return callRemotePanelAction(env, call, {
        current: owned,
        reopen: async () => {
          const token = await openRemotePanelSession(env, pluginKey ?? '', panelId ?? '')
          if (!sessionRef.current || sessionRef.current.environmentId === env) {
            sessionRef.current = { environmentId: env, token }
          }
          return token
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
