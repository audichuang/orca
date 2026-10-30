// @vitest-environment happy-dom
// Fork seam guard: in a folder repo section, every combined view the panel opens lands in the folder
// with the repo as its git owner. Leaf children are stubbed to hand back their callbacks; the store is real.
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { GitBranchCompareSummary } from '../../../../../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { SourceControlSectionViewAction } from '../../../../../../shared/source-control-section-order'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'
import type { SourceControlPanelReadyProps } from './panel-props'
import type { GitHistoryPanelState } from '../sync/git-history-panel'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'

type Callbacks = {
  onReviewConflicts?: () => void
  onViewSection?: (action: SourceControlSectionViewAction) => void
  openBranchAllDiffs?: (worktreeId: string, path: string, summary: GitBranchCompareSummary) => void
}
const callbacks = vi.hoisted((): Callbacks => ({}))
vi.mock('../listing/content-status', () => ({
  SourceControlContentStatus: (props: { onReviewConflicts: () => void }) => {
    callbacks.onReviewConflicts = props.onReviewConflicts
    return null
  }
}))
vi.mock('../listing/uncommitted-sections', () => ({
  SourceControlUncommittedSections: (props: {
    onViewSection: (action: SourceControlSectionViewAction) => void
  }) => {
    callbacks.onViewSection = props.onViewSection
    return null
  }
}))
vi.mock('../listing/branch-section', () => ({
  SourceControlBranchSection: (props: {
    openBranchAllDiffs: typeof callbacks.openBranchAllDiffs
  }) => {
    callbacks.openBranchAllDiffs = props.openBranchAllDiffs
    return null
  }
}))
vi.mock('./commit-surface', () => ({ SourceControlCommitSurface: () => null }))
const history = vi.hoisted((): { props: Record<string, unknown> | null } => ({ props: null }))
vi.mock('../sync/git-history-panel', () => ({
  GitHistoryPanel: (props: Record<string, unknown>) => {
    history.props = props
    return null
  }
}))
// Why: happy-dom has no ResizeObserver and measures every element at 0, so observe the ref itself.
vi.mock('@/lib/toast-bottom-clearance', () => ({ toastBottomClearanceRef: vi.fn() }))
vi.mock('./fork-push-notice', () => ({ SourceControlForkPushNotice: () => null }))

const { SourceControlPanelContent } = await import('./panel-content')
const { toastBottomClearanceRef } = await import('@/lib/toast-bottom-clearance')
const { GitGraphTabLauncher } = await import('../sync/git-graph-tab-launcher')
const { GitHistoryGraphToolbar } = await import('../sync/git-history-graph-toolbar')
const { GitHistoryGraphLoadMore } = await import('../sync/git-history-graph-host-status')
const { GitHistoryGraphEmptyMessage } = await import('../sync/git-history-graph-empty-message')
const { GitHistoryCommitFilesMenu } = await import('../sync/git-history-commit-files-menu')

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'
const SCOPE = { gitWorktreeId: REPO, editorWorktreeId: FOLDER }
const ENTRY: GitStatusEntry = { path: 'a.ts', status: 'modified', area: 'unstaged' }
const CONFLICTS = [{ path: 'c.ts', conflictKind: 'both_modified' as const }]
const SUMMARY: GitBranchCompareSummary = {
  baseRef: 'origin/main',
  baseOid: 'b'.repeat(40),
  compareRef: 'HEAD',
  headOid: 'h'.repeat(40),
  mergeBase: 'm'.repeat(40),
  changedFiles: 1,
  status: 'ready'
}

function renderPanel({ showHistory = false } = {}): void {
  const state = useAppStore.getState()
  const model = {
    openAllDiffs: state.openAllDiffs,
    openBranchAllDiffs: state.openBranchAllDiffs,
    openConflictReview: state.openConflictReview,
    unresolvedConflictReviewEntries: CONFLICTS,
    unresolvedConflicts: [],
    displaySections: [{ id: 'unstaged', area: 'unstaged', items: [ENTRY] }],
    branchSummary: SUMMARY,
    branchEntries: [{ path: 'b.ts', status: 'modified' }],
    filteredBranchEntries: [{ path: 'b.ts', status: 'modified' }],
    fileFilterState: { tooLarge: false },
    collapsedSections: new Set<string>(),
    isGitHistoryVisible: showHistory,
    gitHistoryState: HISTORY_STATE,
    activeRepoTarget: REPO_TARGET,
    loadCommitFiles,
    hasUncommittedEntries: true
  }
  const props = {
    activeRepo: { id: 'repo-1' },
    activeWorktree: { id: REPO, path: '/work/repo-1' },
    currentWorktreeId: REPO,
    worktreePath: '/work/repo-1',
    model
  }
  render(
    <SourceControlWorktreeScopeContext.Provider value={SCOPE}>
      {/* oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the stubbed children and the four opens read only these fields. */}
      <SourceControlPanelContent {...(props as unknown as SourceControlPanelReadyProps)} />
    </SourceControlWorktreeScopeContext.Provider>
  )
}

const HISTORY_STATE: GitHistoryPanelState = { status: 'idle' }
// Why remote: a slot that fell back to a local target would misroute this repo's git reads.
const REPO_TARGET: RuntimeClientTarget = { kind: 'environment', environmentId: 'env-1' }
const loadCommitFiles = vi.fn(async () => [])

const SITES: [string, () => void, string][] = [
  [
    'the conflict banner opens Conflict Review',
    () => callbacks.onReviewConflicts!(),
    'conflict-review'
  ],
  [
    "a conflicts section's View opens Conflict Review",
    () => callbacks.onViewSection!({ kind: 'conflict-review', entries: CONFLICTS }),
    'conflict-review'
  ],
  [
    "a changes section's View opens the combined diff",
    () => callbacks.onViewSection!({ kind: 'combined-diff', area: 'unstaged', entries: [ENTRY] }),
    'diff'
  ],
  [
    "the branch section's View all opens the branch combined diff",
    () => callbacks.openBranchAllDiffs!(REPO, '/work/repo-1', SUMMARY),
    'diff'
  ]
]

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})
afterEach(cleanup)

describe('a folder repo section opens its combined views in the folder (fork)', () => {
  it.each(SITES)('%s under the repo as git owner', (_name, open, mode) => {
    renderPanel()
    open()
    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({ mode, worktreeId: FOLDER, gitWorktreeId: REPO })
    ])
  })
})

describe("the Commits dock carries the fork's slots (fork)", () => {
  it('keeps toasts above the dock', () => {
    renderPanel({ showHistory: true })
    expect(toastBottomClearanceRef).toHaveBeenCalledWith(
      document.querySelector('[data-git-history-dock]')
    )
  })

  it('plugs the Git Graph launcher, filters, load more and no-match message into the repo it shows', () => {
    renderPanel({ showHistory: true })
    expect(history.props).toMatchObject({
      headerActions: {
        type: GitGraphTabLauncher,
        props: { workspaceId: FOLDER, repoWorktreeId: REPO }
      },
      toolbar: {
        type: GitHistoryGraphToolbar,
        props: {
          worktreeId: REPO,
          worktreePath: '/work/repo-1',
          activeRepoTarget: REPO_TARGET,
          state: HISTORY_STATE
        }
      },
      footer: { type: GitHistoryGraphLoadMore, props: { worktreeId: REPO, state: HISTORY_STATE } },
      emptyMessage: { type: GitHistoryGraphEmptyMessage, props: { worktreeId: REPO } }
    })
  })

  it("builds a commit's file menu over this repo's files", () => {
    renderPanel({ showHistory: true })
    const renderMenu = history.props?.renderCommitFilesMenu
    if (typeof renderMenu !== 'function') {
      throw new Error('no renderCommitFilesMenu slot')
    }
    const item = { id: 'c1' }
    expect(renderMenu([item], [], vi.fn(), vi.fn())).toMatchObject({
      type: GitHistoryCommitFilesMenu,
      key: `${REPO}:c1`,
      props: { worktreeId: REPO, worktreePath: '/work/repo-1', items: [item], loadCommitFiles }
    })
  })

  it("opens a commit's Show in Git Graph in the folder, on this repo", () => {
    const openGitGraphTab = vi.fn()
    useAppStore.setState({ openGitGraphTab })
    renderPanel({ showHistory: true })
    const show = history.props?.onShowCommitInGraph
    if (typeof show !== 'function') {
      throw new Error('no onShowCommitInGraph slot')
    }
    show({ id: 'c1' })
    expect(openGitGraphTab).toHaveBeenCalledWith(FOLDER, {
      repoWorktreeId: REPO,
      revealCommit: 'c1'
    })
  })
})
