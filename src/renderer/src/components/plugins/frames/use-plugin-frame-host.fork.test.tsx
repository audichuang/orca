// @vitest-environment happy-dom

import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginHostCallOutcome } from '../../../../../shared/plugins/frames/plugin-protocol'
import type { PanelActionCall } from './plugin-frame-host'
import { usePluginFrameHost } from './use-plugin-frame-host'
type HappyDomWindow = { happyDOM: { waitUntilComplete: () => Promise<void> } }

function happyDomWindow(): HappyDomWindow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: happy-dom installs window.happyDOM; the DOM lib does not declare it.
  return window as unknown as HappyDomWindow
}

type PluginsApiStub = { plugins: Partial<Window['api']['plugins']> }

function partialApi(api: PluginsApiStub): Window['api'] {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a partial preload stub; the code under test calls only these members.
  return api as Window['api']
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

type RemoteHostCall = (call: PanelActionCall) => Promise<PluginHostCallOutcome>

const SESSION_TOKEN = 's'.repeat(43)
const FRAME_KEY = 'plugin:samples.my-plugin/dashboard:1'

let container: HTMLDivElement
let root: Root
const panelActionMock = vi.fn()
const unsubscribeMock = vi.fn()
const subscribePanelPushMock = vi.fn(() => unsubscribeMock)

function Harness({ remoteHostCall }: { remoteHostCall?: RemoteHostCall }): React.JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  usePluginFrameHost({
    surface: 'panel',
    frameRef,
    frameKey: FRAME_KEY,
    sessionToken: SESSION_TOKEN,
    onUnresponsive: () => {},
    remoteHostCall
  })
  return <iframe ref={frameRef} srcDoc="<p>panel</p>" />
}

async function renderHarness(remoteHostCall?: RemoteHostCall): Promise<void> {
  await act(async () => {
    root.render(<Harness remoteHostCall={remoteHostCall} />)
  })
}

function frameWindow(): Window {
  const win = container.querySelector('iframe')?.contentWindow
  if (!win) {
    throw new Error('frame window missing')
  }
  return win
}

async function sendHostCall(id: number): Promise<void> {
  const event = new MessageEvent('message', {
    data: { orca: 1, kind: 'req', id, method: 'notifications.show', params: { title: 'Hi' } }
  })
  Object.defineProperty(event, 'source', { value: frameWindow() })
  await act(async () => {
    window.dispatchEvent(event)
    await happyDomWindow().happyDOM.waitUntilComplete()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  panelActionMock.mockReset()
  panelActionMock.mockResolvedValue({ ok: true, value: 'local' })
  unsubscribeMock.mockReset()
  subscribePanelPushMock.mockClear()
  globalThis.window.api = partialApi({
    plugins: { panelAction: panelActionMock, subscribePanelPush: subscribePanelPushMock }
  })
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('usePluginFrameHost remote host calls (fork)', () => {
  it('sends host calls to remoteHostCall instead of the local preload', async () => {
    const remote = vi.fn<RemoteHostCall>().mockResolvedValue({ ok: true, value: 'from server' })
    await renderHarness(remote)
    const posted = vi.spyOn(frameWindow(), 'postMessage')

    await sendHostCall(7)

    expect(remote).toHaveBeenCalledWith({
      sessionToken: SESSION_TOKEN,
      action: 'notifications.show',
      params: { title: 'Hi' }
    })
    expect(panelActionMock).not.toHaveBeenCalled()
    expect(posted).toHaveBeenCalledWith({ orca: 1, kind: 'res', id: 7, result: 'from server' }, '*')
  })

  it('rewires to a new remoteHostCall under the same frame', async () => {
    const first = vi.fn<RemoteHostCall>().mockResolvedValue({ ok: true, value: 1 })
    const second = vi.fn<RemoteHostCall>().mockResolvedValue({ ok: true, value: 2 })
    await renderHarness(first)
    await renderHarness(second)

    await sendHostCall(1)

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('does not subscribe to local panel pushes for a remote panel', async () => {
    await renderHarness(vi.fn<RemoteHostCall>())

    expect(subscribePanelPushMock).not.toHaveBeenCalled()
  })

  it('drops the local push subscription when the same frame turns remote', async () => {
    await renderHarness()
    expect(subscribePanelPushMock).toHaveBeenCalledTimes(1)

    await renderHarness(vi.fn<RemoteHostCall>())

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(subscribePanelPushMock).toHaveBeenCalledTimes(1)
  })
})
