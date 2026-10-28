// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import type { DiffContent, FileContent } from './editor-panel-content-types'
import { useEditorPanelActiveTabContentLoad } from './useEditorPanelActiveTabContentLoad'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// A folder workspace at /f holding two repos at /f/a and /f/b, both mid-merge.
const FOLDER = 'folder:f1'
const entry: GitStatusEntry = {
  path: 'src/x.ts',
  status: 'modified',
  area: 'unstaged',
  conflictKind: 'both_modified',
  conflictStatus: 'unresolved',
  conflictStatusSource: 'git'
}
const reviewEntries = [{ path: entry.path, conflictKind: 'both_modified' as const }]

function reviewTab(gitWorktreeId: string): OpenFile {
  const tab = useAppStore
    .getState()
    .openFiles.find((f) => f.mode === 'conflict-review' && f.gitWorktreeId === gitWorktreeId)
  if (!tab) {
    throw new Error(`no conflict review tab for ${gitWorktreeId}`)
  }
  return tab
}

describe('conflict review in a folder workspace', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
  })

  it('keeps one review tab per repo, each bound to its repo', () => {
    const state = useAppStore.getState()
    state.openConflictReview(FOLDER, '/f/a', reviewEntries, 'live-summary', {
      gitWorktreeId: 'repo-a'
    })
    state.openConflictReview(FOLDER, '/f/b', reviewEntries, 'live-summary', {
      gitWorktreeId: 'repo-b'
    })

    const reviews = useAppStore.getState().openFiles.filter((f) => f.mode === 'conflict-review')
    expect(reviews).toHaveLength(2)
    expect(reviewTab('repo-a')).toMatchObject({ worktreeId: FOLDER, filePath: '/f/a' })
    expect(reviewTab('repo-b')).toMatchObject({ worktreeId: FOLDER, filePath: '/f/b' })
  })

  it('tracks the opened conflict under the repo and binds the file to it', () => {
    const state = useAppStore.getState()
    state.openConflictReview(FOLDER, '/f/a', reviewEntries, 'live-summary', {
      gitWorktreeId: 'repo-a'
    })
    const reviewId = reviewTab('repo-a').id
    state.openConflictReviewFile(reviewId, FOLDER, '/f/a', entry, 'typescript', {
      gitWorktreeId: 'repo-a'
    })

    const next = useAppStore.getState()
    expect(next.trackedConflictPathsByWorktree['repo-a']).toEqual({ 'src/x.ts': 'both_modified' })
    expect(next.trackedConflictPathsByWorktree[FOLDER]).toBeUndefined()
    expect(next.openFiles.find((f) => f.filePath === '/f/a/src/x.ts')).toMatchObject({
      worktreeId: FOLDER,
      gitWorktreeId: 'repo-a'
    })
  })

  it('reads the overview files through the repo, not the folder', () => {
    useAppStore.getState().openConflictReview(FOLDER, '/f/a', reviewEntries, 'live-summary', {
      gitWorktreeId: 'repo-a'
    })
    const activeFile = reviewTab('repo-a')
    const loadFileContent = vi.fn(async () => {})
    const ref = (): { current: Record<string, number> } => ({ current: {} })
    const fileContents: Record<string, FileContent> = {}
    const diffContents: Record<string, DiffContent> = {}

    function Harness(): null {
      useEditorPanelActiveTabContentLoad({
        activeFile,
        selectedConflictReviewFile: null,
        isVisible: true,
        isChangesMode: false,
        gitStatusEntries: [entry],
        fileContents,
        diffContents,
        fileReadGenerationRef: ref(),
        outstandingFileReadsRef: ref(),
        diffReadGenerationRef: ref(),
        outstandingDiffReadsRef: ref(),
        loadFileContent,
        loadDiffContent: vi.fn(async () => {})
      })
      return null
    }

    const root = createRoot(document.createElement('div'))
    act(() => root.render(<Harness />))
    act(() => root.unmount())

    expect(loadFileContent).toHaveBeenCalledWith(
      '/f/a/src/x.ts',
      expect.any(String),
      FOLDER,
      'src/x.ts',
      { wakeWslDistro: true, gitWorktreeId: 'repo-a' }
    )
  })
})
