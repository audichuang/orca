// @vitest-environment happy-dom
// Fork seam guard: upstream's folder Source Control renders a card for each registered repo under the
// folder path, not only the folder's attached (lineage) worktrees.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import FolderWorkspaceSourceControlPanel from './FolderWorkspaceSourceControlPanel'

vi.mock('./source-control/sync/git-status-refresh', () => ({
  refreshGitStatusForWorktree: async () => {}
}))
vi.mock('./source-control/sync/use-git-status-upstream-ref-watch', () => ({
  useGitStatusUpstreamRefWatch: () => undefined
}))
vi.mock('./source-control/sync/use-refresh-on-host-contact', () => ({
  useRefreshOnHostContact: () => {}
}))
vi.mock('@/lib/worktree-git-copy', () => ({
  resolveWorktreeGitCopyNow: (id: string, hostId: string) => ({
    worktreeId: id,
    hostId,
    transport: { kind: 'local' }
  })
}))
vi.mock('./source-control/panel/panel', () => ({ SourceControlPanel: () => null }))

class OnScreenIntersectionObserver {
  private readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe(target: Element): void {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the section hook reads only target and isIntersecting.
    this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as never)
  }
  unobserve(): void {}
  disconnect(): void {}
}

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('IntersectionObserver', OnScreenIntersectionObserver)
  useAppStore.setState(useAppStore.getInitialState(), true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('renders a card for a registered repo under the folder path that has no lineage', async () => {
  const inside = makeWorktree({
    id: 'inside::/folder/inside',
    repoId: 'inside',
    path: '/folder/inside',
    isMainWorktree: true,
    hostId: 'local'
  })
  const outside = makeWorktree({
    id: 'outside::/elsewhere',
    repoId: 'outside',
    path: '/elsewhere',
    isMainWorktree: true,
    hostId: 'local'
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: fixture supplies the catalog fields the folder panel reads.
  useAppStore.setState({
    activeWorktreeId: 'folder:feature',
    activeWorkspaceKey: 'folder:feature',
    activeWorkspaceExecutionHostId: 'local',
    repos: [
      { id: 'inside', displayName: 'inside', path: '/folder/inside', kind: 'git' },
      { id: 'outside', displayName: 'outside', path: '/elsewhere', kind: 'git' }
    ],
    worktreesByRepo: { inside: [inside], outside: [outside] },
    folderWorkspaces: [
      { id: 'feature', name: 'Feature', folderPath: '/folder', projectGroupId: 'group' }
    ],
    gitStatusByWorktree: { [inside.id]: [], [outside.id]: [] }
  } as unknown as Partial<AppState>)

  await act(async () =>
    root.render(
      <TooltipProvider>
        <FolderWorkspaceSourceControlPanel />
      </TooltipProvider>
    )
  )

  expect(
    [...container.querySelectorAll('[data-source-control-worktree]')].map((el) =>
      el.getAttribute('data-source-control-worktree')
    )
  ).toEqual(['inside::/folder/inside'])
})
