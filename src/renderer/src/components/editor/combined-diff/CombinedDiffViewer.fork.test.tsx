// @vitest-environment happy-dom
// Fork seam guard: a folder repo's combined diff opens its alternate view and Conflict Review in the
// folder with the repo as git owner. Leaf controls are stubbed to hand back their callbacks; the store is real.
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { GitBranchCompareSummary } from '../../../../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

type Callbacks = { onOpenAlternateDiff?: () => void; onReviewConflicts?: () => void }
const callbacks = vi.hoisted((): Callbacks => ({}))
vi.mock('@/lib/monaco-setup', () => ({}))
vi.mock('./review-controls/combined-diff-toolbar', () => ({
  CombinedDiffToolbar: (props: { onOpenAlternateDiff: () => void }) => {
    callbacks.onOpenAlternateDiff = props.onOpenAlternateDiff
    return null
  }
}))
vi.mock('./review-controls/combined-diff-skipped-conflicts', () => {
  const capture = (props: { onReviewConflicts: () => void }) => {
    callbacks.onReviewConflicts = props.onReviewConflicts
    return null
  }
  return {
    CombinedDiffNoChangesEmptyState: () => null,
    CombinedDiffSkippedConflictNotice: capture,
    CombinedDiffSkippedConflictsEmptyState: capture
  }
})
vi.mock('./scroll-viewport/combined-diff-section-list', () => ({
  CombinedDiffSectionList: () => null
}))
vi.mock('./browse-files/combined-diff-file-tree', () => ({ CombinedDiffFileTree: () => null }))

const { default: CombinedDiffViewer } = await import('./CombinedDiffViewer')

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'
const ENTRY: GitStatusEntry = { path: 'a.ts', status: 'modified', area: 'unstaged' }
const CONFLICT: GitStatusEntry = {
  path: 'c.ts',
  status: 'modified',
  area: 'unstaged',
  conflictKind: 'both_modified',
  conflictStatus: 'unresolved'
}
const SUMMARY: GitBranchCompareSummary = {
  baseRef: 'origin/main',
  baseOid: 'b'.repeat(40),
  compareRef: 'HEAD',
  headOid: 'h'.repeat(40),
  mergeBase: 'm'.repeat(40),
  changedFiles: 1,
  status: 'ready'
}

function renderOnlyTab(): OpenFile {
  const [file] = useAppStore.getState().openFiles
  expect(file).toMatchObject({ worktreeId: FOLDER, gitWorktreeId: REPO })
  useAppStore.setState({ openFiles: [] })
  render(<CombinedDiffViewer file={file!} viewStateKey={file!.id} />)
  return file!
}

function expectOpenedUnderRepo(mode: OpenFile['mode'], excluding: OpenFile): void {
  expect(useAppStore.getState().openFiles.filter((f) => f.id !== excluding.id)).toEqual([
    expect.objectContaining({ mode, worktreeId: FOLDER, gitWorktreeId: REPO })
  ])
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    gitStatusByWorktree: { [REPO]: [ENTRY, CONFLICT] },
    gitBranchChangesByWorktree: { [REPO]: [{ path: 'b.ts', status: 'modified' }] },
    gitBranchCompareSummaryByWorktree: { [REPO]: SUMMARY }
  })
  callbacks.onOpenAlternateDiff = undefined
  callbacks.onReviewConflicts = undefined
})
afterEach(cleanup)

describe("a folder repo's combined diff opens its follow-ups under the repo (fork)", () => {
  it('switches from branch changes back to all changes', () => {
    useAppStore.getState().openBranchAllDiffs(
      FOLDER,
      '/work/repo-1',
      SUMMARY,
      { source: 'combined-all' },
      {
        gitWorktreeId: REPO
      }
    )
    const file = renderOnlyTab()
    callbacks.onOpenAlternateDiff!()
    expectOpenedUnderRepo('diff', file)
  })

  it('switches from all changes to branch changes', () => {
    useAppStore
      .getState()
      .openAllDiffs(FOLDER, '/work/repo-1', { source: 'combined-branch' }, undefined, [ENTRY], {
        gitWorktreeId: REPO
      })
    const file = renderOnlyTab()
    callbacks.onOpenAlternateDiff!()
    expectOpenedUnderRepo('diff', file)
  })

  it('reviews the conflicts it skipped', () => {
    useAppStore
      .getState()
      .openAllDiffs(FOLDER, '/work/repo-1', undefined, undefined, [ENTRY, CONFLICT], {
        gitWorktreeId: REPO
      })
    const file = renderOnlyTab()
    callbacks.onReviewConflicts!()
    expectOpenedUnderRepo('conflict-review', file)
  })
})
