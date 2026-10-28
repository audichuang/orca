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
vi.mock('./fork-push-notice', () => ({ SourceControlForkPushNotice: () => null }))

const { SourceControlPanelContent } = await import('./panel-content')

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

function renderPanel(): void {
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
    isGitHistoryVisible: false,
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
