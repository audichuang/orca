// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  openCheckedRemotePanelSession,
  type RemotePanelAvailability
} from './remote-plugin-panel-route'
import { useRemotePluginPanelRoute } from './use-remote-plugin-panel-route'

const local = vi.hoisted(() => ({ version: '1.0.0' }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: object) => unknown) => selector({})
}))
vi.mock('@/store/repos/owner-routing', () => ({ getRuntimeEnvironmentDisplayName: () => 'Server' }))
vi.mock('@/store/plugin-panels', () => ({
  usePluginPanelsStore: (selector: (state: object) => unknown) =>
    selector({ plugins: [{ pluginKey: 'sample.monitor', version: local.version }] })
}))
vi.mock('./remote-plugin-panel-route', () => ({
  focusedPanelOwnerKey: () => 'remote:server-a',
  openCheckedRemotePanelSession: vi.fn(),
  callRemotePanelAction: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

type Opened = { availability: RemotePanelAvailability; token: string | null }

it('ignores a check made for the previous local version once the new one found a mismatch', async () => {
  let finishOldCheck: (opened: Opened) => void = () => {}
  vi.mocked(openCheckedRemotePanelSession)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishOldCheck = resolve
      })
    )
    .mockResolvedValueOnce({
      availability: { kind: 'version-mismatch', localVersion: '2.0.0', remoteVersion: '1.0.0' },
      token: null
    })
  const panel = { pluginKey: 'sample.monitor', id: 'main', tabKey: 'plugin:sample.monitor/main' }
  const { result, rerender } = renderHook(() => useRemotePluginPanelRoute(panel))

  local.version = '2.0.0'
  rerender()
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    finishOldCheck({ availability: { kind: 'ready' }, token: 'old-version-token' })
    await Promise.resolve()
  })

  expect(result.current).toMatchObject({ kind: 'remote', status: 'version-mismatch' })
})
