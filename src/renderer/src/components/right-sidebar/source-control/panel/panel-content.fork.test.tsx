// @vitest-environment happy-dom
// Fork seam guard: in a folder repo section, every combined view the panel opens lands in the folder
// with the repo as its git owner, and the Commits dock carries the fork's slots. Real upstream children and
// store; only window.api and the toast-clearance observer are stubbed.
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { useAppStore } from '@/store'
import type { GitBranchCompareSummary } from '../../../../../../shared/git/diff/git-diff-compare-types'
import type { GitHistoryResult } from '../../../../../../shared/git/history/git-history-types'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import type {
  SourceControlDisplaySection,
  SourceControlDisplaySectionId
} from '../../../../../../shared/source-control/listing/source-control-section-order'
import {
  cleanupFolderSourceControl,
  FolderScope,
  FOLDER,
  resetFolderSourceControl,
  WORKTREE
} from './folder-source-control-test-fixture'
import type { SourceControlBranchSection } from '../listing/branch-section'
import { SourceControlPanelContent } from './panel-content'
import { useSourceControlPanelModel } from './use-panel-model'
import type { SourceControlPanelModel } from './use-panel-model'

// Why: happy-dom has no ResizeObserver and measures every element at 0, so observe the ref itself.
vi.mock('@/lib/toast-bottom-clearance', () => ({ toastBottomClearanceRef: vi.fn() }))
const { toastBottomClearanceRef } = await import('@/lib/toast-bottom-clearance')

const UNSTAGED: GitStatusEntry = { path: 'a.ts', status: 'modified', area: 'unstaged' }
const CONFLICT: GitStatusEntry = {
  path: 'c.ts',
  status: 'modified',
  area: 'unstaged',
  conflictKind: 'both_modified',
  conflictStatus: 'unresolved'
}
const SECTIONS: SourceControlDisplaySection[] = [
  { id: 'conflicts', area: 'unstaged', items: [CONFLICT] },
  { id: 'unstaged', area: 'unstaged', items: [UNSTAGED] }
]
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
const BRANCH_SUMMARY = {
  baseRef: 'origin/main',
  baseOid: 'b'.repeat(40),
  compareRef: 'HEAD',
  headOid: 'h'.repeat(40),
  mergeBase: 'm'.repeat(40),
  changedFiles: 1,
  status: 'ready' as const
}
const BRANCH_ENTRIES = [{ path: 'b.ts', status: 'modified' as const }]

const commitCompare = vi.fn()

beforeEach(() => {
  const api = resetFolderSourceControl()
  commitCompare.mockReset()
  vi.stubGlobal('api', {
    ...api,
    git: { ...api.git, history: vi.fn(async () => HISTORY), commitCompare }
  })
  vi.mocked(toastBottomClearanceRef).mockClear()
})
afterEach(() => {
  cleanupFolderSourceControl()
})

function renderPanel({
  showHistory = false,
  history = HISTORY
}: { showHistory?: boolean; history?: GitHistoryResult } = {}) {
  const hook = renderHook(useSourceControlPanelModel, { wrapper: FolderScope })
  const byId = new Map<SourceControlDisplaySectionId, SourceControlDisplaySection>(
    SECTIONS.map((section) => [section.id, section])
  )
  // Why: the model is the panel's prop; only its data is replaced, so every action and child is the real one.
  const model: SourceControlPanelModel = {
    ...hook.result.current,
    displaySections: SECTIONS,
    unfilteredDisplaySectionsById: byId,
    unresolvedConflicts: [CONFLICT],
    unresolvedConflictReviewEntries: [{ path: CONFLICT.path, conflictKind: 'both_modified' }],
    branchSummary: BRANCH_SUMMARY,
    branchEntries: BRANCH_ENTRIES,
    filteredBranchEntries: BRANCH_ENTRIES,
    collapsedSections: new Set<string>(),
    isGitHistoryVisible: showHistory,
    gitHistoryState: { status: 'ready', result: history }
  }
  render(
    <FolderScope>
      <SourceControlPanelContent
        activeRepo={model.activeRepo!}
        activeWorktree={WORKTREE}
        currentWorktreeId={WORKTREE.id}
        worktreePath={WORKTREE.path}
        model={model}
      />
    </FolderScope>
  )
}

// Why: the panel's openBranchAllDiffs lambda drops a 4th argument silently; widening upstream's prop must fail typecheck here.
expectTypeOf<
  Parameters<ComponentProps<typeof SourceControlBranchSection>['openBranchAllDiffs']>
>().toEqualTypeOf<[string, string, GitBranchCompareSummary]>()

function sectionByLabel(label: string): HTMLElement {
  // Why: the nearest ancestor of the header that holds a View all button is that section's own wrapper.
  let el = screen.getByText(label).parentElement
  while (el && within(el).queryAllByRole('button', { name: 'View all' }).length === 0) {
    el = el.parentElement
  }
  if (!el) {
    throw new Error(`no section for ${label}`)
  }
  return el
}

const expectOpenedInFolder = (mode: string) =>
  expect(useAppStore.getState().openFiles).toEqual([
    expect.objectContaining({ mode, worktreeId: FOLDER, gitWorktreeId: WORKTREE.id })
  ])

describe('a folder repo section opens its combined views in the folder (fork)', () => {
  it('opens Conflict Review from the conflict banner under the repo as git owner', () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Review conflicts' }))
    expectOpenedInFolder('conflict-review')
  })

  it("opens Conflict Review from a conflicts section's View all", () => {
    renderPanel()
    fireEvent.click(within(sectionByLabel('Conflicts')).getByRole('button', { name: 'View all' }))
    expectOpenedInFolder('conflict-review')
  })

  it("opens the combined diff from a changes section's View all", () => {
    renderPanel()
    fireEvent.click(within(sectionByLabel('Changes')).getByRole('button', { name: 'View all' }))
    expectOpenedInFolder('diff')
  })

  it("opens the branch combined diff from the branch section's View all", () => {
    renderPanel()
    fireEvent.click(
      within(sectionByLabel('Committed on Branch')).getByRole('button', { name: 'View all' })
    )
    expectOpenedInFolder('diff')
  })
})

describe("the Commits dock carries the fork's slots (fork)", () => {
  it('keeps toasts above the dock', () => {
    renderPanel({ showHistory: true })
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
    renderPanel({ showHistory: true })
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
