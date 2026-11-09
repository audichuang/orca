import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import type { PluginHostCallOutcome } from '../../../../../../shared/plugins/frames/plugin-protocol'
import type { PanelActionCall } from '../../../plugins/frames/plugin-frame-host'
import {
  callRemotePanelAction,
  openCheckedRemotePanelSession,
  remotePanelSessionUnavailable,
  type RemotePanelAvailability
} from './remote-plugin-panel-route'

export type RemotePanelSessionState = {
  status: 'loading' | 'unreachable' | RemotePanelAvailability['kind']
  availability: RemotePanelAvailability | null
}

export const REMOTE_PANEL_LOADING: RemotePanelSessionState = {
  status: 'loading',
  availability: null
}

// Why retry: the server may still be connecting at startup, or the plugin installed there later.
const RETRY_MS = 10_000

/**
 * One server, one panel, one local UI version. Its token, checks and calls belong to it alone,
 * so once the panel moves to another host or version, nothing this one still has in flight can
 * change what the new one shows or which token it uses.
 */
export class RemotePanelSession {
  private token: string | null = null
  private active = false
  private state = REMOTE_PANEL_LOADING
  private readonly listeners = new Set<() => void>()
  private poller: { refresh: () => void; stop: () => void } | null = null

  constructor(
    private readonly environmentId: string,
    private readonly panel: { pluginKey: string; id: string; tabKey: string },
    private readonly localVersion: string | null
  ) {}

  start(): void {
    this.active = true
    const stop = installWindowVisibilityTimeoutPoller({
      run: () => this.check(),
      getDelayMs: () => (this.state.status === 'ready' ? null : RETRY_MS)
    })
    this.poller = { refresh: stop.refresh, stop }
  }

  stop(): void {
    this.active = false
    this.token = null
    this.poller?.stop()
    this.poller = null
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getState = (): RemotePanelSessionState => this.state

  readonly callHostMethod = (call: PanelActionCall): Promise<PluginHostCallOutcome> =>
    this.active
      ? callRemotePanelAction(this.environmentId, call, {
          current: () => (this.active ? this.token : null),
          reopen: () => this.open()
        })
      : Promise.resolve(remotePanelSessionUnavailable())

  /** Checks the server's copy and opens a session; the first open, retries and reopens alike. */
  private async open(): Promise<string | null> {
    if (!this.active) {
      return null
    }
    const { availability, token } = await openCheckedRemotePanelSession(
      this.environmentId,
      this.panel,
      this.localVersion
    )
    if (!this.active) {
      return null
    }
    this.token = token
    this.setState({ status: availability.kind, availability })
    if (availability.kind !== 'ready') {
      this.poller?.refresh()
    }
    return token
  }

  private async check(): Promise<void> {
    try {
      await this.open()
    } catch {
      if (this.active) {
        this.setState({ status: 'unreachable', availability: null })
      }
    }
  }

  private setState(next: RemotePanelSessionState): void {
    this.state = next
    for (const listener of this.listeners) {
      listener()
    }
  }
}
