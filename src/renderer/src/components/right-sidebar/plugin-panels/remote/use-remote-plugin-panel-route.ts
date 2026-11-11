import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { getRuntimeEnvironmentDisplayName } from '@/store/repos/owner-routing'
import type { PluginHostCallOutcome } from '../../../../../../shared/plugins/frames/plugin-protocol'
import type { PanelActionCall } from '../../../plugins/frames/plugin-frame-host'
import {
  focusedPanelOwnerKey,
  remotePanelSessionUnavailable,
  type RemotePanelAvailability
} from './remote-plugin-panel-route'
import { REMOTE_PANEL_LOADING, RemotePanelSession } from './remote-plugin-panel-session'

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

const noSubscription = (): (() => void) => () => {}
const loadingState = () => REMOTE_PANEL_LOADING
const refuseHostCall = (): Promise<PluginHostCallOutcome> =>
  Promise.resolve(remotePanelSessionUnavailable())

/** Where this panel's host calls go: the paired server owning the focused workspace, else here. */
export function useRemotePluginPanelRoute(
  panel: { pluginKey: string; id: string; tabKey: string } | null,
  /** The loaded panel document's revision; null until one is ready. */
  documentRevision: number | null
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

  // A new host, panel or document gets a new session; the old one is stopped, not reused, so a
  // reloaded document never inherits a token checked against the previous version.
  const session = useMemo(
    () =>
      environmentId && !ownerPending && pluginKey && panelId && tabKey && documentRevision !== null
        ? new RemotePanelSession(environmentId, { pluginKey, id: panelId, tabKey })
        : null,
    [environmentId, ownerPending, pluginKey, panelId, tabKey, documentRevision]
  )
  useEffect(() => {
    if (!session) {
      return
    }
    session.start()
    return () => session.stop()
  }, [session])
  const state = useSyncExternalStore(
    session?.subscribe ?? noSubscription,
    session?.getState ?? loadingState
  )

  if (!environmentId) {
    return { kind: 'local' }
  }
  return {
    kind: 'remote',
    environmentId,
    hostName,
    status: state.status,
    availability: state.availability,
    callHostMethod: session?.callHostMethod ?? refuseHostCall
  }
}
