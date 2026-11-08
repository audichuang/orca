import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import { usePluginPanelsStore } from '@/store/plugin-panels'
import { getRuntimeEnvironmentDisplayName } from '@/store/repos/owner-routing'
import type { PluginHostCallOutcome } from '../../../../../../shared/plugins/frames/plugin-protocol'
import type { PanelActionCall } from '../../../plugins/frames/plugin-frame-host'
import {
  callRemotePanelAction,
  focusedPanelOwnerKey,
  openCheckedRemotePanelSession,
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
  const ownerKey = useAppStore(focusedPanelOwnerKey)
  const separator = ownerKey.indexOf(':')
  const environmentId = separator === -1 ? null : ownerKey.slice(separator + 1)
  // The session already names the server, but its workspace rows are still loading.
  const ownerPending = ownerKey.startsWith('pending:')
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
  const pollerRef = useRef<{ refresh: () => void } | null>(null)
  const readyRef = useRef(false)
  // The local version is part of it: a check made for another local UI version is not this one's.
  const routeKey =
    environmentId && tabKey && !ownerPending
      ? `${environmentId}\0${tabKey}\0${localVersion ?? ''}`
      : null
  // Bumped whenever the route or the local version changes; older checks then change nothing.
  const generationRef = useRef(0)

  // One path for the first open, the retries and a reopen after the server dropped the session.
  const openChecked = useCallback(async (): Promise<string | null> => {
    if (!environmentId || !pluginKey || !panelId || !tabKey || !routeKey) {
      return null
    }
    const generation = generationRef.current
    const { availability: value, token } = await openCheckedRemotePanelSession(
      environmentId,
      { pluginKey, id: panelId, tabKey },
      localVersion
    )
    if (generationRef.current !== generation) {
      return null
    }
    sessionRef.current = { environmentId, token }
    readyRef.current = value.kind === 'ready'
    setAvailability({ key: routeKey, value })
    if (!readyRef.current) {
      pollerRef.current?.refresh()
    }
    return token
  }, [environmentId, pluginKey, panelId, tabKey, routeKey, localVersion])

  useEffect(() => {
    if (!routeKey) {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    // The previous route's or version's token must not serve a single call of this one.
    sessionRef.current = null
    readyRef.current = false
    let cancelled = false
    const check = async (): Promise<void> => {
      try {
        await openChecked()
      } catch {
        if (!cancelled && generationRef.current === generation) {
          readyRef.current = false
          setAvailability({ key: routeKey, value: 'unreachable' })
        }
      }
    }
    const poller = installWindowVisibilityTimeoutPoller({
      run: () => (cancelled ? undefined : check()),
      getDelayMs: () => (readyRef.current ? null : RETRY_MS)
    })
    pollerRef.current = poller
    return () => {
      cancelled = true
      generationRef.current += 1
      pollerRef.current = null
      poller()
    }
  }, [routeKey, openChecked])

  const callHostMethod = useCallback(
    (call: PanelActionCall): Promise<PluginHostCallOutcome> => {
      // Only handed to the frame once the route is ready, so the server is known.
      const env = environmentId ?? ''
      return callRemotePanelAction(env, call, {
        current: () =>
          sessionRef.current?.environmentId === env ? sessionRef.current.token : null,
        reopen: openChecked
      })
    },
    [environmentId, openChecked]
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
