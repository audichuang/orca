// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import type { AppState } from '../../store/types'

const { getStateMock } = vi.hoisted(() => ({ getStateMock: vi.fn() }))

vi.mock('../../store', () => ({ useAppStore: { getState: getStateMock } }))
vi.mock('../../hooks/ipc-tab-switch', () => ({ activateCyclableTab: vi.fn() }))

import RecentTabSwitcher from './RecentTabSwitcher'

const WORKTREE_ID = 'wt-1'
const GROUP_ID = 'group-1'

function makeTab(id: string, contentType: Tab['contentType']): Tab {
  return {
    id,
    entityId: `file-${id}`,
    groupId: GROUP_ID,
    worktreeId: WORKTREE_ID,
    contentType,
    label: id,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function makeStore(): AppState {
  const tabs = [makeTab('editor-tab', 'editor'), makeTab('graph-tab', 'git-graph')]
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the switcher reads only these fields.
  return {
    activeView: 'terminal',
    activeWorktreeId: WORKTREE_ID,
    activeGroupIdByWorktree: { [WORKTREE_ID]: GROUP_ID },
    groupsByWorktree: {
      [WORKTREE_ID]: [
        {
          id: GROUP_ID,
          worktreeId: WORKTREE_ID,
          activeTabId: 'editor-tab',
          tabOrder: ['editor-tab', 'graph-tab'],
          recentTabIds: ['graph-tab', 'editor-tab']
        }
      ]
    },
    openFiles: tabs.map((tab) => ({ id: tab.entityId, worktreeId: WORKTREE_ID, isDirty: false })),
    settings: { ctrlTabOrderMode: 'mru' },
    tabBarOrderByWorktree: {},
    tabsByWorktree: {},
    browserTabsByWorktree: {},
    unifiedTabsByWorktree: { [WORKTREE_ID]: tabs }
  } as unknown as AppState
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('RecentTabSwitcher with a Git Graph tab', () => {
  it('marks the Git Graph tab with the Git Graph icon', async () => {
    getStateMock.mockReturnValue(makeStore())
    let openSwitcher: ((data: { shiftKey: boolean }) => void) | null = null
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: {
          onCtrlTabKeyDown: vi.fn((callback: (data: { shiftKey: boolean }) => void) => {
            openSwitcher = callback
            return vi.fn()
          }),
          onCtrlTabKeyUp: vi.fn(() => vi.fn())
        }
      }
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => root.render(<RecentTabSwitcher />))
    await act(async () => openSwitcher?.({ shiftKey: false }))

    const options = [...document.body.querySelectorAll('[role="option"]')]
    const graphOption = options.find((option) => option.textContent?.includes('graph-tab'))
    expect(graphOption).toBeDefined()
    expect(graphOption!.querySelector('svg.lucide-git-graph')).not.toBeNull()
    act(() => root.unmount())
  })
})
