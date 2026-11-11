// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from 'vitest'
import type { PluginHostListEntry } from '../../../../../../shared/plugins/plugin-list-entry'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { RemotePanelSession } from './remote-plugin-panel-session'

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: vi.fn() }))

afterEach(() => {
  vi.resetAllMocks()
})

const TAB = 'plugin:sample.monitor/main'
const PANEL = { pluginKey: 'sample.monitor', id: 'main', tabKey: TAB }
const listed: PluginHostListEntry = {
  pluginKey: 'sample.monitor',
  consentFingerprint: null,
  name: 'Monitor',
  version: '1.0.0',
  publisher: 'sample',
  status: 'running',
  needsReconsent: false,
  isDev: false,
  official: false,
  bundled: false,
  capabilities: [],
  panels: [{ id: 'main', title: 'Monitor', tabKey: TAB }],
  commands: [],
  hasWorker: true,
  restarts: 0
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve()
  }
}

it("a left host's late dead session opens nothing and leaves the new host ready", async () => {
  let finishOldCall: (reply: unknown) => void = () => {}
  const calls: string[] = []
  vi.mocked(callRuntimeRpc).mockImplementation(async (target, method) => {
    const env = target.kind === 'environment' ? target.environmentId : 'local'
    calls.push(`${env} ${method}`)
    if (method === 'plugins.list') {
      return [listed]
    }
    if (method === 'plugins.readPanelEntry') {
      return { html: '', sessionToken: `${env}-token` }
    }
    if (env === 'server-a') {
      return new Promise((resolve) => {
        finishOldCall = resolve
      })
    }
    return { outcome: { ok: true, value: 'b data' } }
  })
  const a = new RemotePanelSession('server-a', PANEL, () => Promise.resolve('1.0.0'))
  a.start()
  await settle()
  const oldCall = a.callHostMethod({ sessionToken: 'local', action: 'plugin.request' })
  await settle()

  a.stop()
  const b = new RemotePanelSession('server-b', PANEL, () => Promise.resolve('1.0.0'))
  b.start()
  await settle()
  expect(b.getState().status).toBe('ready')
  const callsBeforeLateReply = calls.length

  finishOldCall({
    outcome: { ok: false, code: 'invalid_request', error: 'invalid panel session' }
  })
  expect((await oldCall).ok).toBe(false)
  await settle()
  expect(calls.slice(callsBeforeLateReply)).toEqual([])
  expect(b.getState().status).toBe('ready')
  expect(await b.callHostMethod({ sessionToken: 'local', action: 'plugin.request' })).toEqual({
    ok: true,
    value: 'b data'
  })
  b.stop()
})

it("a restarted session ignores its first run's late failure", async () => {
  let failFirstList: (error: Error) => void = () => {}
  let lists = 0
  vi.mocked(callRuntimeRpc).mockImplementation(async (_target, method) => {
    if (method === 'plugins.list') {
      lists += 1
      if (lists === 1) {
        return new Promise((_resolve, reject) => {
          failFirstList = reject
        })
      }
      return [listed]
    }
    return { html: '', sessionToken: 'second-run-token' }
  })
  // StrictMode replays the effect: start, stop, start on the same session.
  const session = new RemotePanelSession('server-a', PANEL, () => Promise.resolve('1.0.0'))
  session.start()
  session.stop()
  session.start()
  await settle()
  expect(session.getState().status).toBe('ready')

  failFirstList(new Error('socket closed'))
  await settle()
  expect(session.getState().status).toBe('ready')
  session.stop()
})

it('checks the version installed now, so a document reloaded for an update meets the old server copy', async () => {
  vi.mocked(callRuntimeRpc).mockResolvedValue([listed])
  const session = new RemotePanelSession('server-a', PANEL, () => Promise.resolve('2.0.0'))
  session.start()
  await settle()

  expect(session.getState()).toEqual({
    status: 'version-mismatch',
    availability: { kind: 'version-mismatch', localVersion: '2.0.0', remoteVersion: '1.0.0' }
  })
  expect(vi.mocked(callRuntimeRpc).mock.calls.map((call) => call[1])).toEqual(['plugins.list'])
  session.stop()
})

it("reads the installed version from main's plugin list by default", async () => {
  vi.mocked(callRuntimeRpc).mockResolvedValue([listed])
  const list = vi.fn().mockResolvedValue([{ ...listed, version: '2.0.0' }])
  window.api = { plugins: { list } } as unknown as Window['api']
  const session = new RemotePanelSession('server-a', PANEL)
  session.start()
  await settle()

  expect(list).toHaveBeenCalled()
  expect(session.getState().status).toBe('version-mismatch')
  session.stop()
})
