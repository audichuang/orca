// @vitest-environment happy-dom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { GitBranchCompareSummary } from '../../../../../shared/git-diff-compare-types'
import { makeWorktree, TEST_REPO } from '@/store/slices/worktrees-slice-test-fixtures'
import type { GitStatusEntry } from '../../../../../shared/git-status-types'

vi.mock('@monaco-editor/react', () => ({ DiffEditor: () => null }))
vi.mock('@/lib/monaco-setup', () => ({
  monaco: {
    Uri: { parse: (path: string) => path },
    editor: { getModel: () => null, getModels: () => [], getEditors: () => [] }
  }
}))

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
  render(
    <TooltipProvider>
      <CombinedDiffViewer file={file!} viewStateKey={file!.id} />
    </TooltipProvider>
  )
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
    fireEvent.click(screen.getByRole('button', { name: 'Open All Changes' }))
    expectOpenedUnderRepo('diff', file)
  })

  it('switches from all changes to branch changes', () => {
    useAppStore
      .getState()
      .openAllDiffs(FOLDER, '/work/repo-1', { source: 'combined-branch' }, undefined, [ENTRY], {
        gitWorktreeId: REPO
      })
    const file = renderOnlyTab()
    fireEvent.click(screen.getByRole('button', { name: 'Open Branch Diff' }))
    expectOpenedUnderRepo('diff', file)
  })

  it('reviews the conflicts it skipped', () => {
    useAppStore
      .getState()
      .openAllDiffs(FOLDER, '/work/repo-1', undefined, undefined, [ENTRY, CONFLICT], {
        gitWorktreeId: REPO
      })
    const file = renderOnlyTab()
    fireEvent.click(screen.getByRole('button', { name: 'Review conflicts' }))
    expectOpenedUnderRepo('conflict-review', file)
  })
})

it('clears repo review notes through the folder combined diff controls', async () => {
  const previous = window.api
  const updateMeta = vi.fn(async () => ({}))
  Object.assign(window, { api: { ...previous, worktrees: { ...previous?.worktrees, updateMeta } } })
  useAppStore.setState({
    repos: [{ ...TEST_REPO, id: 'repo-1', path: '/work/repo-1', executionHostId: 'local' }],
    worktreesByRepo: {
      'repo-1': [
        makeWorktree({
          id: REPO,
          repoId: 'repo-1',
          path: '/work/repo-1',
          hostId: 'local',
          diffComments: [
            {
              id: 'note',
              worktreeId: REPO,
              filePath: 'a.ts',
              lineNumber: 1,
              body: 'Check repo change',
              createdAt: 1,
              side: 'modified'
            }
          ]
        })
      ]
    }
  })
  useAppStore
    .getState()
    .openAllDiffs(FOLDER, '/work/repo-1', undefined, undefined, [ENTRY], { gitWorktreeId: REPO })
  renderOnlyTab()
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 AI note' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear Notes' }))
    await waitFor(() =>
      expect(updateMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          worktreeId: REPO,
          updates: { diffComments: [] }
        })
      )
    )
    expect(useAppStore.getState().worktreesByRepo['repo-1']?.[0]?.diffComments).toEqual([])
  } finally {
    cleanup()
    Object.assign(window, { api: previous })
  }
})
