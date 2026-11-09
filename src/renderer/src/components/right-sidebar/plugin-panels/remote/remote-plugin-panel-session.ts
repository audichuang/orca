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

/** One start() to its stop(): StrictMode starts the same session twice, and the first run's late
 *  replies must not count for the second. */
type SessionRun = {
  active: boolean
  token: string | null
  poller: { refresh: () => void; stop: () => void } | null
}

/**
 * One server, one panel, one local UI version. Its token, checks and calls belong to it alone,
 * so once the panel moves to another host or version, nothing this one still has in flight can
 * change what the new one shows or which token it uses.
 */
export class RemotePanelSession {
  private run: SessionRun | null = null
  private state = REMOTE_PANEL_LOADING
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly environmentId: string,
    private readonly panel: { pluginKey: string; id: string; tabKey: string },
    private readonly localVersion: string | null
  ) {}

  start(): void {
    const run: SessionRun = { active: true, token: null, poller: null }
    this.run = run
    const stop = installWindowVisibilityTimeoutPoller({
      run: () => this.check(run),
      getDelayMs: () => (this.state.status === 'ready' ? null : RETRY_MS)
    })
    run.poller = { refresh: stop.refresh, stop }
  }

  stop(): void {
    const run = this.run
    this.run = null
    if (run) {
      run.active = false
      run.token = null
      run.poller?.stop()
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getState = (): RemotePanelSessionState => this.state

  readonly callHostMethod = (call: PanelActionCall): Promise<PluginHostCallOutcome> => {
    const run = this.run
    return run
      ? callRemotePanelAction(this.environmentId, call, {
          current: () => (run.active ? run.token : null),
          reopen: () => this.open(run)
        })
      : Promise.resolve(remotePanelSessionUnavailable())
  }

  /** Checks the server's copy and opens a session; the first open, retries and reopens alike. */
  private async open(run: SessionRun): Promise<string | null> {
    if (!run.active) {
      return null
    }
    const { availability, token } = await openCheckedRemotePanelSession(
      this.environmentId,
      this.panel,
      this.localVersion
    )
    if (!run.active) {
      return null
    }
    run.token = token
    this.setState({ status: availability.kind, availability })
    if (availability.kind !== 'ready') {
      run.poller?.refresh()
    }
    return token
  }

  private async check(run: SessionRun): Promise<void> {
    try {
      await this.open(run)
    } catch {
      if (run.active) {
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
