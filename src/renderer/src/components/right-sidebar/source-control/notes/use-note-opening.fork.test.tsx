// @vitest-environment happy-dom
// Fork seam guard: a note opened from a folder repo section lands in the folder's editor through the
// real store, with the repo kept as the tab's git owner.
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { DiffComment } from '../../../../../../shared/diff-comment-types'
import { useSourceControlNoteOpening } from './use-note-opening'

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'
const COMMENT: DiffComment = {
  id: 'note-1',
  worktreeId: REPO,
  filePath: 'src/a.ts',
  lineNumber: 3,
  body: 'check this',
  createdAt: 1,
  side: 'modified'
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

function renderNoteOpening() {
  return renderHook(() =>
    useSourceControlNoteOpening({
      activeWorktreeId: REPO,
      editorWorktreeId: FOLDER,
      worktreePath: '/work/repo-1',
      entries: [],
      branchEntries: [],
      branchSummary: null,
      handleOpenDiff: () => {},
      openCommittedDiff: () => {},
      sourceControlRef: { current: null }
    })
  )
}

describe('opening a note from a folder repo section (fork)', () => {
  it('opens the file in the folder editor and keeps the repo as its git owner', () => {
    const { result } = renderNoteOpening()

    result.current.handleOpenComment(COMMENT)

    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({
        filePath: '/work/repo-1/src/a.ts',
        worktreeId: FOLDER,
        gitWorktreeId: REPO
      })
    ])
  })

  it('opens a markdown note in the folder editor with the repo as its git owner', () => {
    const { result } = renderNoteOpening()

    result.current.handleOpenComment({ ...COMMENT, filePath: 'docs/a.md', source: 'markdown' })

    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({
        filePath: '/work/repo-1/docs/a.md',
        worktreeId: FOLDER,
        gitWorktreeId: REPO
      })
    ])
  })
})
