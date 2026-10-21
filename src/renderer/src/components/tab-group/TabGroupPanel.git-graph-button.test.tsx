// Fork-only: covers where TabGroupPanel mounts the tab-strip Git Graph button.
// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    activeWorktreeId: 'wt-a',
    rightSidebarOpen: true,
    sidebarOpen: true,
    groupsByWorktree: {}
  }
  const useAppStore = (selector: (current: typeof state) => unknown): unknown => selector(state)
  useAppStore.getState = () => state
  return { useAppStore, activeContentType: { value: 'terminal' } }
})
vi.mock('@/store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('../../store', () => ({ useAppStore: mocks.useAppStore }))
vi.mock('../tab-bar/TabBar', () => ({ default: () => null }))
vi.mock('../tab-bar/TabBarQuickCommandsButton', () => ({
  TabBarQuickCommandsButton: () => null
}))
vi.mock('../right-sidebar/source-control/sync/git-graph-tab-launcher', () => ({
  TabStripGitGraphButton: ({ workspaceId, active }: { workspaceId: string; active: boolean }) => (
    <button type="button" data-testid="git-graph-button" data-workspace={workspaceId}>
      {active ? 'active' : 'idle'}
    </button>
  )
}))
vi.mock('@/lib/pane-manager/client-hosted-browser-row-state', () => ({
  useClientHostedBrowserRows: () => []
}))
vi.mock('./useTabGroupWorkspaceModel', () => ({
  useTabGroupWorkspaceModel: () => ({
    activeTab: { id: 'tab-1', entityId: 'e-1', contentType: mocks.activeContentType.value },
    agentSessionItems: [],
    browserItems: [],
    commands: { focusGroup: () => undefined, closeGroup: () => undefined },
    editorItems: [],
    tabBarOrder: [],
    terminalTabs: [],
    groupTabs: [],
    expandedPaneByTabId: {}
  })
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import TabGroupPanel from './TabGroupPanel'

function renderPanel(reserveClosedExplorerToggleSpace: boolean) {
  return render(
    <TooltipProvider>
      <TabGroupPanel
        groupId="group-a"
        worktreeId="wt-a"
        isVisible
        isFocused
        hasSplitGroups={false}
        touchesLeftEdge={false}
        touchesRightEdge
        reserveClosedExplorerToggleSpace={reserveClosedExplorerToggleSpace}
        reserveCollapsedSidebarHeaderSpace={false}
      />
    </TooltipProvider>
  )
}

afterEach(() => {
  cleanup()
  mocks.activeContentType.value = 'terminal'
})

describe('TabGroupPanel Git Graph button', () => {
  it('renders only in the group that owns the top-right corner', () => {
    expect(renderPanel(false).queryByTestId('git-graph-button')).toBeNull()
    cleanup()
    const button = renderPanel(true).getByTestId('git-graph-button')
    expect(button.dataset.workspace).toBe('wt-a')
    expect(button.textContent).toBe('idle')
  })

  it('shows as active when the group is on the Git Graph tab', () => {
    mocks.activeContentType.value = 'git-graph'
    expect(renderPanel(true).getByTestId('git-graph-button').textContent).toBe('active')
  })
})
