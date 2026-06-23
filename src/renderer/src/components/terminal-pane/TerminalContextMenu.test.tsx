/**
 * @vitest-environment happy-dom
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TerminalContextMenu from './TerminalContextMenu'

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children?: ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button type="button" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuShortcut: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => children,
  DropdownMenuSubContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => children
}))

vi.mock('lucide-react', () => ({
  Clipboard: () => null,
  Copy: () => null,
  Eraser: () => null,
  GitFork: () => null,
  Maximize2: () => null,
  Minimize2: () => null,
  PanelBottomClose: () => null,
  PanelsTopLeft: () => null,
  PanelRightClose: () => null,
  Pencil: () => null,
  Play: () => null,
  Plus: () => null,
  RefreshCw: () => null,
  X: () => null
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  formatShortcutLabel: () => 'Unassigned'
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => null
}))

const mounted: { container: HTMLDivElement; root: Root }[] = []

function renderMenu({
  onClearScreen = vi.fn(),
  onRefreshDisplay = vi.fn()
}: {
  onClearScreen?: ReturnType<typeof vi.fn>
  onRefreshDisplay?: ReturnType<typeof vi.fn>
} = {}): {
  container: HTMLDivElement
  onClearScreen: ReturnType<typeof vi.fn>
  onRefreshDisplay: ReturnType<typeof vi.fn>
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const Component = TerminalContextMenu as React.ComponentType<Record<string, unknown>>

  act(() => {
    root.render(
      <Component
        open
        onOpenChange={vi.fn()}
        menuPoint={{ x: 0, y: 0 }}
        menuOpenedAtRef={{ current: 0 }}
        canClosePane={false}
        canExpandPane={false}
        menuPaneIsExpanded={false}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        onSplitRight={vi.fn()}
        onSplitDown={vi.fn()}
        keybindings={{}}
        canEqualizePaneSizes={false}
        onEqualizePaneSizes={vi.fn()}
        onClosePane={vi.fn()}
        onClearScreen={onClearScreen}
        onRefreshDisplay={onRefreshDisplay}
        onForkAgentSession={vi.fn()}
        repoQuickCommands={[]}
        globalQuickCommands={[]}
        quickCommandRepoLabel={null}
        onQuickCommand={vi.fn()}
        onAddQuickCommand={vi.fn()}
        onToggleExpand={vi.fn()}
        onSetTitle={vi.fn()}
        onCopyTerminalId={vi.fn()}
        onCopyPaneId={vi.fn()}
      />
    )
  })
  mounted.push({ container, root })
  return { container, onClearScreen, onRefreshDisplay }
}

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label)
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`)
  }
  return button
}

afterEach(() => {
  for (const { container, root } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  vi.restoreAllMocks()
})

describe('TerminalContextMenu', () => {
  it('offers a display refresh action separate from clearing the terminal buffer', () => {
    const { container, onClearScreen, onRefreshDisplay } = renderMenu()

    act(() => getButton(container, 'Refresh Display').click())

    expect(onRefreshDisplay).toHaveBeenCalledTimes(1)
    expect(onClearScreen).not.toHaveBeenCalled()
  })
})
