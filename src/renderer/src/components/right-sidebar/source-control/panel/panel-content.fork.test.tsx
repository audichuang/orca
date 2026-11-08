// @vitest-environment happy-dom
// Fork seam guard: the Commits dock carries the fork's slots (toast clearance and the commit files menu).
// Real upstream children and store; only window.api and the toast-clearance observer are stubbed.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultSettings } from '../../../../../../shared/constants'
import type { GitHistoryResult } from '../../../../../../shared/git/history/git-history-types'
import { SourceControlPanelContent } from './panel-content'
import { useSourceControlPanelModel } from './use-panel-model'
import type { SourceControlPanelModel } from './use-panel-model'

// Why: happy-dom has no ResizeObserver and measures every element at 0, so observe the ref itself.
vi.mock('@/lib/toast-bottom-clearance', () => ({ toastBottomClearanceRef: vi.fn() }))
const { toastBottomClearanceRef } = await import('@/lib/toast-bottom-clearance')
// Why: happy-dom lays nothing out, so the virtualized Commits list would render no rows.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 28,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 28 })),
    measureElement: vi.fn()
  })
}))

const REPO = {
  id: 'repo-a',
  path: '/work/repo-a',
  displayName: 'repo-a',
  badgeColor: '#000',
  addedAt: 0
}
const WORKTREE = makeWorktree({
  id: 'repo-a::/work/repo-a',
  repoId: REPO.id,
  path: REPO.path,
  hostId: 'local'
})

const COMMIT_ID = 'c'.repeat(40)
const HISTORY: GitHistoryResult = {
  items: [
    {
      id: COMMIT_ID,
      parentIds: [],
      subject: 'Fix the thing',
      message: 'Fix the thing',
      timestamp: 1
    }
  ],
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: false,
  limit: 50
}

const commitCompare = vi.fn()

function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfirmationDialogProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </ConfirmationDialogProvider>
  )
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: getDefaultSettings('/tmp'),
    activeWorktreeId: WORKTREE.id,
    repos: [REPO],
    worktreesByRepo: { [REPO.id]: [WORKTREE] }
  })
  commitCompare.mockReset()
  vi.stubGlobal('api', {
    git: {
      history: vi.fn(async () => HISTORY),
      commitCompare,
      mutationInFlight: vi.fn(async () => ({ inFlight: false })),
      status: vi.fn(async () => ({ entries: [], head: 'abc123' })),
      conflictOperation: vi.fn(async () => 'none'),
      upstreamStatus: vi.fn(async () => null)
    },
    app: { platform: 'linux' }
  })
  vi.mocked(toastBottomClearanceRef).mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPanel(): void {
  const hook = renderHook(useSourceControlPanelModel, { wrapper: Providers })
  const model: SourceControlPanelModel = {
    ...hook.result.current,
    collapsedSections: new Set<string>(),
    isGitHistoryVisible: true,
    gitHistoryState: { status: 'ready', result: HISTORY }
  }
  render(
    <Providers>
      <SourceControlPanelContent
        activeRepo={model.activeRepo!}
        activeWorktree={WORKTREE}
        currentWorktreeId={WORKTREE.id}
        worktreePath={WORKTREE.path}
        model={model}
      />
    </Providers>
  )
}

describe("the Commits dock carries the fork's slots (fork)", () => {
  it('keeps toasts above the dock', () => {
    renderPanel()
    expect(toastBottomClearanceRef).toHaveBeenCalledWith(
      document.querySelector('[data-git-history-dock]')
    )
  })

  it("offers the files menu on a commit's files, read from this repo", async () => {
    commitCompare.mockResolvedValue({
      summary: {
        commitOid: COMMIT_ID,
        parentOid: null,
        compareRef: COMMIT_ID.slice(0, 7),
        baseRef: null,
        status: 'ready',
        changedFiles: 1
      },
      entries: [{ path: 'src/x.ts', status: 'modified' }]
    })
    renderPanel()
    fireEvent.click(await screen.findByText('Fix the thing'))
    const file = await waitFor(() => {
      const el = document.querySelector('[data-commit-file-path="src/x.ts"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(commitCompare).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: WORKTREE.path })
    )
    fireEvent.contextMenu(file)
    expect(await screen.findByRole('menuitem', { name: /Copy Full Source/ })).toBeInTheDocument()
  })
})
