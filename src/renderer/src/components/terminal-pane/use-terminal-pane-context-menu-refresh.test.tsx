/**
 * @vitest-environment happy-dom
 */
import { act, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport'
import type { PaneCwdMap } from './resolve-split-cwd'
import { useTerminalPaneContextMenu } from './use-terminal-pane-context-menu'

const paneRegistryMock = vi.hoisted(() => ({
  refitAndRefreshAllTerminalPanes: vi.fn<() => void>(),
  refreshAllTerminalPanes: vi.fn<() => void>(),
  resetAllTerminalWebglAtlases: vi.fn<() => void>()
}))

vi.mock('@/lib/pane-manager/pane-manager-registry', () => paneRegistryMock)

type TerminalMenuState = ReturnType<typeof useTerminalPaneContextMenu> & {
  onRefreshDisplay?: () => void
}

const mounted: { container: HTMLDivElement; root: Root }[] = []

function renderContextMenuHook(): TerminalMenuState {
  let state: TerminalMenuState | null = null
  const managerRef = { current: null } as RefObject<PaneManager | null>
  const paneTransportsRef = { current: new Map<number, PtyTransport>() } as RefObject<
    Map<number, PtyTransport>
  >
  const paneCwdRef = { current: new Map() } as RefObject<PaneCwdMap>
  const containerRef = { current: document.createElement('div') } as RefObject<HTMLDivElement>
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  function Probe(): null {
    state = useTerminalPaneContextMenu({
      managerRef,
      paneTransportsRef,
      paneCwdRef,
      containerRef,
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      groupId: null,
      fallbackCwd: '',
      toggleExpandPane: vi.fn(),
      onRequestClosePane: vi.fn(),
      onClearPaneScrollback: vi.fn(),
      onSetTitle: vi.fn(),
      onPasteError: vi.fn(),
      onAgentSessionForkReady: vi.fn(),
      forceBracketedMultilineTextPaste: false,
      rightClickToPaste: false
    })
    return null
  }

  act(() => {
    root.render(<Probe />)
  })
  mounted.push({ container, root })
  if (!state) {
    throw new Error('Hook did not render')
  }
  return state
}

beforeEach(() => {
  paneRegistryMock.refitAndRefreshAllTerminalPanes.mockReset()
  paneRegistryMock.refreshAllTerminalPanes.mockReset()
  paneRegistryMock.resetAllTerminalWebglAtlases.mockReset()
})

afterEach(() => {
  for (const { container, root } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

describe('useTerminalPaneContextMenu display refresh', () => {
  it('resets WebGL atlases and repaints panes without requiring a pane target', () => {
    const state = renderContextMenuHook()

    act(() => state.onRefreshDisplay?.())

    expect(paneRegistryMock.resetAllTerminalWebglAtlases).toHaveBeenCalledTimes(1)
    expect(paneRegistryMock.refreshAllTerminalPanes).toHaveBeenCalledTimes(1)
  })

  it('repaints only — never refits/resizes panes (a resize reflows scrollback and garbles width)', () => {
    const state = renderContextMenuHook()

    act(() => state.onRefreshDisplay?.())

    expect(paneRegistryMock.refitAndRefreshAllTerminalPanes).not.toHaveBeenCalled()
  })
})
