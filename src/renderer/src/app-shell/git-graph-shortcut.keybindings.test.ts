// @vitest-environment happy-dom
// Fork seam guard: upstream's global key dispatch still routes the Open Git Graph chord to its handler.
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { useGlobalKeybindings } from '@/app-shell/use-global-keybindings'
import { useAppChromeLayout } from '@/app-shell/use-app-chrome-layout'
import { useFloatingWorkspacePanel } from '@/app-shell/use-floating-workspace-panel'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'

vi.mock('@/store/plugin-panels', () => ({ usePluginCommands: () => [] }))
const platform = vi.hoisted((): { current: NodeJS.Platform } => ({ current: 'win32' }))
vi.mock('@/lib/shortcut-platform', () => ({ getShortcutPlatform: () => platform.current }))
vi.mock('@/app-shell/app-window-chrome', () => ({
  get shortcutPlatform() {
    return platform.current
  }
}))

const REPO: Repo = {
  id: 'repo-api',
  path: '/work/api',
  displayName: 'api',
  badgeColor: '#000',
  addedAt: 0,
  kind: 'git'
}
const WORKTREE: Worktree = {
  id: 'wt-api',
  repoId: 'repo-api',
  path: '/work/api',
  head: 'abc',
  branch: 'refs/heads/main',
  isBare: false,
  isMainWorktree: true,
  displayName: 'api-main',
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  linkedGitLabMR: null,
  linkedGitLabIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
}
const openGitGraphTab = vi.fn(() => null)

beforeEach(() => {
  useAppStore.setState({
    activeView: 'terminal',
    activeWorktreeId: WORKTREE.id,
    repos: [REPO],
    worktreesByRepo: { [REPO.id]: [WORKTREE] },
    openGitGraphTab
  })
})

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

// Mod+Shift+H is Cmd on macOS and Ctrl elsewhere.
it.each([
  ['darwin', 'Macintosh; Intel Mac OS X 14_0', { metaKey: true }],
  ['win32', 'Windows NT 10.0', { ctrlKey: true }],
  ['linux', 'X11; Linux x86_64', { ctrlKey: true }]
] as const)(
  'opens the Git Graph tab for the active workspace on its default chord (%s)',
  (os, userAgent, modifier) => {
    platform.current = os
    vi.stubGlobal('navigator', { userAgent })
    renderHook(() =>
      useGlobalKeybindings({
        layout: useAppChromeLayout(),
        floatingWorkspace: useFloatingWorkspacePanel()
      })
    )
    const event = new KeyboardEvent('keydown', {
      key: 'h',
      code: 'KeyH',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...modifier
    })
    Object.defineProperty(event, 'getModifierState', { value: () => false })
    document.body.dispatchEvent(event)

    expect(openGitGraphTab).toHaveBeenCalledWith(WORKTREE.id)
    expect(event.defaultPrevented).toBe(true)
  }
)
