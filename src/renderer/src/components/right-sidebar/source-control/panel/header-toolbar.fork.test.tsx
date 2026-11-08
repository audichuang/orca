// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { makeWorktree, TEST_REPO } from '@/store/slices/worktrees-slice-test-fixtures'
import { SourceControlHeaderToolbar } from './header-toolbar'

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

it('offers the Git Graph entry in a repo workspace toolbar', () => {
  const openGitGraphTab = vi.fn()
  const worktree = makeWorktree({ id: 'wt-web', repoId: TEST_REPO.id, path: TEST_REPO.path })
  useAppStore.setState({
    openGitGraphTab,
    activeWorktreeId: worktree.id,
    repos: [TEST_REPO],
    worktreesByRepo: { [TEST_REPO.id]: [worktree] }
  })
  render(
    <TooltipProvider>
      <SourceControlHeaderToolbar
        filterQuery=""
        filterExpanded={false}
        onFilterQueryChange={vi.fn()}
        onFilterExpandedChange={vi.fn()}
        visibleCreatePrHeaderAction={null}
        hostedReview={null}
        isCreatePrIntentInFlight={false}
        isCreatingPr={false}
        onCreatePrHeaderClick={vi.fn()}
        onOpenHostedReviewInChecks={vi.fn()}
        suppressedGitHubPRNumber={null}
        onRelinkSuppressedGitHubPR={vi.fn()}
        sourceControlViewMode="list"
        viewModeToggleDisabled={false}
        onToggleViewMode={vi.fn()}
        onChangeBaseRef={vi.fn()}
        onRefreshBranchCompare={vi.fn()}
        branchCompareRefreshDisabled={false}
        diffCommentCount={0}
        onExpandNotes={vi.fn()}
        branchSummary={null}
        compareBaseRef={null}
      />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
  expect(openGitGraphTab).toHaveBeenCalledWith('wt-web', { repoWorktreeId: undefined })
})
