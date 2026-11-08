// Fork: a panel whose focused workspace lives on a paired server shows this computer's copy of
// the panel UI, but its host calls go to the same plugin on that server, so it shows that
// server's data. Upstream remotes serve only srcdoc HTML, which cannot load a panel's own files.
import type { PluginHostCallOutcome } from '../../../../../../shared/plugins/frames/plugin-protocol'
import type { PluginFrameEntry } from '../../../../../../shared/plugins/frames/plugin-frame-bridge'
import type { PluginHostListEntry } from '../../../../../../shared/plugins/plugin-list-entry'
import { collectActivePluginPanels } from '@/store/plugin-panels'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { PanelActionCall } from '../../../plugins/frames/plugin-frame-host'

export type RemotePanelAvailability =
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'version-mismatch'; localVersion: string; remoteVersion: string }

/** The remote copy must be enabled with this panel, and match the local UI's version. */
export function remotePanelAvailability(
  remotePlugins: readonly PluginHostListEntry[],
  tabKey: string,
  localVersion: string | null
): RemotePanelAvailability {
  const panel = collectActivePluginPanels(remotePlugins).find((each) => each.tabKey === tabKey)
  const remote = panel ? remotePlugins.find((each) => each.pluginKey === panel.pluginKey) : null
  if (!remote) {
    return { kind: 'missing' }
  }
  if (localVersion !== null && remote.version !== localVersion) {
    return { kind: 'version-mismatch', localVersion, remoteVersion: remote.version }
  }
  return { kind: 'ready' }
}

const target = (environmentId: string) => ({ kind: 'environment' as const, environmentId })

export function listRemotePlugins(environmentId: string): Promise<PluginHostListEntry[]> {
  return callRuntimeRpc(target(environmentId), 'plugins.list')
}

/** Opens a panel session on the server; its token is bound to this client's connection. */
export async function openRemotePanelSession(
  environmentId: string,
  pluginKey: string,
  panelId: string
): Promise<string | null> {
  const entry = await callRuntimeRpc<PluginFrameEntry | null>(
    target(environmentId),
    'plugins.readPanelEntry',
    { pluginKey, panelId }
  )
  return entry?.sessionToken ?? null
}

// The server's answer when the token's connection or plugin revision is gone.
function isDeadSession(outcome: PluginHostCallOutcome): boolean {
  return (
    !outcome.ok && outcome.code === 'invalid_request' && outcome.error === 'invalid panel session'
  )
}

/**
 * Sends one host call with the server's token; a reconnect or a plugin update on the server
 * invalidates it, so a dead session is reopened once and the call resent.
 */
export async function callRemotePanelAction(
  environmentId: string,
  call: PanelActionCall,
  session: { current: () => string | null; reopen: () => Promise<string | null> }
): Promise<PluginHostCallOutcome> {
  const send = async (sessionToken: string): Promise<PluginHostCallOutcome> =>
    (
      await callRuntimeRpc<{ outcome: PluginHostCallOutcome }>(
        target(environmentId),
        'plugins.panelAction',
        { sessionToken, action: call.action, params: call.params }
      )
    ).outcome
  try {
    const token = session.current() ?? (await session.reopen())
    if (!token) {
      return { ok: false, code: 'unavailable', error: 'The plugin is not available on that host.' }
    }
    const outcome = await send(token)
    if (!isDeadSession(outcome)) {
      return outcome
    }
    const fresh = await session.reopen()
    return fresh ? await send(fresh) : outcome
  } catch (error) {
    return {
      ok: false,
      code: 'unavailable',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
