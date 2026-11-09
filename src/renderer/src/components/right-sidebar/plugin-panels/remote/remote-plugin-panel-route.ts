// Fork: a panel whose focused workspace lives on a paired server shows this computer's copy of
// the panel UI, but its host calls go to the same plugin on that server, so it shows that
// server's data. Upstream remotes serve only srcdoc HTML, which cannot load a panel's own files.
import type { PluginHostCallOutcome } from '../../../../../../shared/plugins/frames/plugin-protocol'
import type { PluginFrameEntry } from '../../../../../../shared/plugins/frames/plugin-frame-bridge'
import type { PluginHostListEntry } from '../../../../../../shared/plugins/plugin-list-entry'
import { collectActivePluginPanels } from '@/store/plugin-panels'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import type { PanelActionCall } from '../../../plugins/frames/plugin-frame-host'
import { parseExecutionHostId } from '../../../../../../shared/execution-host'
import { getActiveWorkspaceOwnerTarget } from '@/lib/resolved-worktree-execution-host'
import type { WorktreeRuntimeOwnerState } from '@/lib/workspace/ownership/worktree-runtime-owner-state'

/**
 * Who serves the focused workspace's panels: `local` (this computer, also direct SSH), a paired
 * server, or `pending` while a workspace the session puts on a server has no hydrated owner yet;
 * treating that as local would show this computer's data under the server's workspace.
 */
export function focusedPanelOwnerKey(state: WorktreeRuntimeOwnerState): string {
  const owner = getActiveWorkspaceOwnerTarget(state)
  if (owner?.kind === 'environment') {
    return `remote:${owner.environmentId}`
  }
  if (owner || !state.activeWorktreeId) {
    return 'local'
  }
  const hinted = parseExecutionHostId(state.activeWorkspaceExecutionHostId)
  return hinted?.kind === 'runtime' ? `pending:${hinted.environmentId}` : 'local'
}

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

/** Checks the server's copy, then opens a session only when it can serve this panel's UI. */
export async function openCheckedRemotePanelSession(
  environmentId: string,
  panel: { pluginKey: string; id: string; tabKey: string },
  localVersion: string | null
): Promise<{ availability: RemotePanelAvailability; token: string | null }> {
  const availability = remotePanelAvailability(
    await listRemotePlugins(environmentId),
    panel.tabKey,
    localVersion
  )
  const token =
    availability.kind === 'ready'
      ? await openRemotePanelSession(environmentId, panel.pluginKey, panel.id)
      : null
  return { availability, token }
}

// The server's answers when the token's connection is gone, or its plugin was updated or re-enabled.
const DEAD_SESSION_ERRORS = new Set([
  'invalid_request\0invalid panel session',
  'unavailable\0panel session is no longer available'
])
function isDeadSession(outcome: PluginHostCallOutcome): boolean {
  return !outcome.ok && DEAD_SESSION_ERRORS.has(`${outcome.code}\0${outcome.error}`)
}

export function remotePanelSessionUnavailable(): PluginHostCallOutcome {
  return {
    ok: false,
    code: 'unavailable',
    error: translate(
      'auto.components.right.sidebar.RemotePluginPanel.sessionUnavailable',
      'The plugin is not available on that host.'
    )
  }
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
      return remotePanelSessionUnavailable()
    }
    const outcome = await send(token)
    if (!isDeadSession(outcome)) {
      return outcome
    }
    // Reopening rechecks the server's copy; a changed version must not get this UI's call.
    const fresh = await session.reopen()
    return fresh ? await send(fresh) : remotePanelSessionUnavailable()
  } catch (error) {
    return {
      ok: false,
      code: 'unavailable',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
