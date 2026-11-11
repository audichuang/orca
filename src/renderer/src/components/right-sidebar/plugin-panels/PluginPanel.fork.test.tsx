// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivePluginPanel } from '@/store/plugins/catalog/plugin-contribution-catalog'
import type { RemotePluginPanelRoute } from './remote/use-remote-plugin-panel-route'

vi.mock('@/i18n/i18n', () => ({
  getIntlLocale: () => 'en-US',
  translate: (key: string) => key
}))

const { usePluginPanelsMock, routeMock } = vi.hoisted(() => ({
  usePluginPanelsMock: vi.fn<() => ActivePluginPanel[]>(() => []),
  routeMock: vi.fn<() => RemotePluginPanelRoute>(() => ({ kind: 'local' }))
}))

vi.mock('@/store/plugins/catalog/plugin-contribution-catalog', () => ({
  usePluginPanels: usePluginPanelsMock,
  usePluginPanelsStore: (selector: (state: { setPanelHealth: () => void }) => unknown) =>
    selector({ setPanelHealth: () => {} })
}))

// The fork route is the edge here: PluginPanel's wiring of it into upstream's frame host is under test.
vi.mock('./remote/use-remote-plugin-panel-route', () => ({
  useRemotePluginPanelRoute: routeMock
}))

import PluginPanel from './PluginPanel'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const TAB_KEY = 'plugin:samples.my-plugin/dashboard'
const SESSION_TOKEN = 's'.repeat(43)
const dashboardPanel: ActivePluginPanel = {
  id: 'dashboard',
  title: 'Dashboard',
  icon: 'gauge',
  tabKey: TAB_KEY,
  pluginKey: 'samples.my-plugin',
  pluginName: 'My Plugin'
}

let container: HTMLDivElement
let root: Root
const panelActionMock = vi.fn()

function remoteRoute(
  environmentId: string,
  status: Extract<RemotePluginPanelRoute, { kind: 'remote' }>['status'],
  callHostMethod = vi.fn()
): RemotePluginPanelRoute {
  return {
    kind: 'remote',
    environmentId,
    hostName: 'Build box',
    status,
    availability: status === 'ready' ? { kind: 'ready' } : null,
    callHostMethod
  }
}

function waitForHappyDomTasks(): Promise<void> {
  return (
    window as unknown as { happyDOM: { waitUntilComplete: () => Promise<void> } }
  ).happyDOM.waitUntilComplete()
}

async function renderPanel(): Promise<void> {
  await act(async () => {
    root.render(<PluginPanel tabKey={TAB_KEY} />)
    await waitForHappyDomTasks()
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  panelActionMock.mockReset()
  panelActionMock.mockResolvedValue({ ok: true, value: { delivered: true } })
  routeMock.mockReset()
  usePluginPanelsMock.mockReturnValue([dashboardPanel])
  globalThis.window.api = {
    plugins: {
      readPanelEntry: vi.fn().mockResolvedValue({
        html: '<h1>Hello plugin</h1>',
        sessionToken: SESSION_TOKEN
      }),
      panelAction: panelActionMock,
      onChanged: () => vi.fn()
    }
  } as unknown as Window['api']
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  container.remove()
  vi.restoreAllMocks()
})

describe('PluginPanel remote route (fork)', () => {
  it("sends the frame's host calls to the paired server's plugin", async () => {
    const callHostMethod = vi.fn().mockResolvedValue({ ok: true, value: null })
    routeMock.mockReturnValue(remoteRoute('env-1', 'ready', callHostMethod))
    await renderPanel()
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()

    const event = new MessageEvent('message', {
      data: { orca: 1, kind: 'req', id: 1, method: 'notifications.show', params: { title: 'Hi' } }
    })
    Object.defineProperty(event, 'source', { value: iframe?.contentWindow })
    await act(async () => {
      window.dispatchEvent(event)
      await waitForHappyDomTasks()
    })

    expect(callHostMethod).toHaveBeenCalledWith({
      sessionToken: SESSION_TOKEN,
      action: 'notifications.show',
      params: { title: 'Hi' }
    })
    expect(panelActionMock).not.toHaveBeenCalled()
  })

  it('remounts the frame when the focused workspace moves to another server', async () => {
    routeMock.mockReturnValue(remoteRoute('env-1', 'ready'))
    await renderPanel()
    const first = container.querySelector('iframe')
    expect(first).not.toBeNull()

    routeMock.mockReturnValue(remoteRoute('env-2', 'ready'))
    await renderPanel()

    const second = container.querySelector('iframe')
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
  })

  it('shows a notice instead of the frame while the server copy cannot serve the panel', async () => {
    routeMock.mockReturnValue(remoteRoute('env-1', 'missing'))
    await renderPanel()

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.textContent).toBe('auto.components.right.sidebar.RemotePluginPanel.missing')
  })
})
