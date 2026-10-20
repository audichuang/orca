// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitHistoryPanelState } from './git-history-panel'

const mocks = vi.hoisted(() => ({ getRuntimeGitHistory: vi.fn() }))
vi.mock('@/runtime/runtime-git-status-client', () => ({
  getRuntimeGitHistory: mocks.getRuntimeGitHistory
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const { GitGraphFullView } = await import('./git-graph-full-view')
const { resetGitHistoryGraphFiltersForTest } = await import('./git-history-graph-filter')
const { resetGitGraphRememberedSelectionForTest } = await import('./use-git-graph-full-view-state')
const { resetGitGraphBranchTreePreferenceForTest } = await import('./use-git-graph-branch-tree')

const RESULT: GitHistoryResult = {
  items: [
    {
      id: 'a'.repeat(40),
      displayId: 'aaaaaaa',
      parentIds: [],
      subject: 'Alpha',
      message: 'Alpha',
      timestamp: 1,
      references: [{ id: 'refs/heads/main', name: 'main', category: 'branches' }]
    }
  ],
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: false,
  limit: 50
}

// A tab sits beside other panes, unlike the old full-window dialog.
function TabHost({ state }: { state: GitHistoryPanelState }): React.JSX.Element {
  return (
    <TooltipProvider>
      <input aria-label="Other pane" />
      <section aria-label="Git Graph">
        <GitGraphFullView
          worktreeId="wt-1"
          worktreePath="/repo"
          activeRepoTarget={{ kind: 'local' }}
          state={state}
          onRefresh={vi.fn()}
          onOpenCommit={vi.fn()}
          onLoadCommitFiles={vi.fn(async () => [])}
          onOpenCommitFile={vi.fn()}
        />
      </section>
    </TooltipProvider>
  )
}

beforeEach(() => {
  mocks.getRuntimeGitHistory.mockImplementation(async () => ({ ...RESULT }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  resetGitHistoryGraphFiltersForTest()
  resetGitGraphRememberedSelectionForTest()
  resetGitGraphBranchTreePreferenceForTest()
  vi.clearAllMocks()
})

describe('Git Graph hosted in an editor tab', () => {
  it('lands on the first commit when history arrives and focus never left', async () => {
    const { rerender } = render(<TabHost state={{ status: 'loading' }} />)
    rerender(<TabHost state={{ status: 'ready', result: RESULT }} />)
    const row = await screen.findByTestId('git-graph-full-row')
    expect(row).toHaveFocus()
  })

  it('does not pull focus out of another pane when history arrives later', async () => {
    const { rerender } = render(<TabHost state={{ status: 'loading' }} />)
    const other = screen.getByRole('textbox', { name: 'Other pane' })
    act(() => other.focus())

    rerender(<TabHost state={{ status: 'ready', result: RESULT }} />)
    await screen.findByTestId('git-graph-full-row')
    expect(other).toHaveFocus()
  })

  it("sizes the branch tree from the view's width, not the window's", async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
    const original = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.hasAttribute('data-git-graph-root')
        ? new DOMRect(0, 0, 900, 600)
        : original.call(this)
    })
    render(<TabHost state={{ status: 'ready', result: RESULT }} />)
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    // A 1600px window would dock the tree open; the 900px tab keeps it closed, then floats it.
    expect(within(view).queryByRole('navigation', { name: 'Branches and tags' })).toBeNull()

    fireEvent.click(within(view).getByRole('button', { name: 'Toggle branches' }))
    const tree = within(view).getByRole('navigation', { name: 'Branches and tags' })
    expect(tree.closest('.absolute')).not.toBeNull()
  })

  it('Escape still closes the floating tree after a click left focus on the view itself', async () => {
    render(<TabHost state={{ status: 'ready', result: RESULT }} />)
    const view = await screen.findByRole('region', { name: 'Git Graph' })
    fireEvent.click(within(view).getByRole('button', { name: 'Toggle branches' }))
    expect(within(view).getByRole('navigation', { name: 'Branches and tags' })).toBeVisible()
    // A click on a non-focusable spot focuses the nearest focusable ancestor: the view root.
    const root = view.querySelector<HTMLElement>('[data-git-graph-root]')!
    expect(root).toHaveAttribute('tabindex', '-1')
    act(() => root.focus())

    fireEvent.keyDown(root, { key: 'Escape' })
    expect(within(view).queryByRole('navigation', { name: 'Branches and tags' })).toBeNull()
  })
})
