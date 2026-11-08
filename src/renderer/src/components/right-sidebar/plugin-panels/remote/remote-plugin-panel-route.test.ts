import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginHostListEntry } from '../../../../../../shared/plugins/plugin-list-entry'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { callRemotePanelAction, remotePanelAvailability } from './remote-plugin-panel-route'

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: vi.fn() }))

afterEach(() => {
  vi.resetAllMocks()
})

const TAB = 'plugin:sample.monitor/main'
function plugin(overrides: Partial<PluginHostListEntry>): PluginHostListEntry {
  return {
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
    restarts: 0,
    ...overrides
  }
}

describe('remotePanelAvailability', () => {
  it('needs the same panel enabled on the server at the local version', () => {
    expect(remotePanelAvailability([plugin({})], TAB, '1.0.0')).toEqual({ kind: 'ready' })
    expect(remotePanelAvailability([], TAB, '1.0.0')).toEqual({ kind: 'missing' })
    expect(remotePanelAvailability([plugin({ status: 'disabled' })], TAB, '1.0.0')).toEqual({
      kind: 'missing'
    })
    expect(remotePanelAvailability([plugin({ version: '1.1.0' })], TAB, '1.0.0')).toEqual({
      kind: 'version-mismatch',
      localVersion: '1.0.0',
      remoteVersion: '1.1.0'
    })
  })
})

describe('callRemotePanelAction', () => {
  const call = { sessionToken: 'local-token', action: 'plugin.request', params: { n: 1 } }

  it('sends the server token, reopening a dead session once and resending', async () => {
    vi.mocked(callRuntimeRpc)
      .mockResolvedValueOnce({
        outcome: { ok: false, code: 'invalid_request', error: 'invalid panel session' }
      })
      .mockResolvedValueOnce({ outcome: { ok: true, value: 'server data' } })
    const reopen = vi.fn().mockResolvedValue('fresh-token')
    const outcome = await callRemotePanelAction('server-a', call, {
      current: () => 'old-token',
      reopen
    })
    expect(outcome).toEqual({ ok: true, value: 'server data' })
    expect(reopen).toHaveBeenCalledTimes(1)
    expect(vi.mocked(callRuntimeRpc).mock.calls).toEqual([
      [
        { kind: 'environment', environmentId: 'server-a' },
        'plugins.panelAction',
        { sessionToken: 'old-token', action: 'plugin.request', params: { n: 1 } }
      ],
      [
        { kind: 'environment', environmentId: 'server-a' },
        'plugins.panelAction',
        { sessionToken: 'fresh-token', action: 'plugin.request', params: { n: 1 } }
      ]
    ])
  })

  it('answers unavailable when the server cannot be reached', async () => {
    vi.mocked(callRuntimeRpc).mockRejectedValueOnce(new Error('socket closed'))
    const outcome = await callRemotePanelAction('server-a', call, {
      current: () => 'token',
      reopen: vi.fn()
    })
    expect(outcome).toEqual({ ok: false, code: 'unavailable', error: 'socket closed' })
  })
})
