// @vitest-environment happy-dom
// Fork seam guard: a folder repo's commit combined diff opens through the real store as a folder tab
// owned by the repo's git state; only window.api's commit compare is stubbed.
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { getDiffFilePosition } from '../../../editor/diff-file-sequence'
import { commitFileTargets } from './commit-file-sequence'
import { useGitHistoryCommitActions } from './use-git-history-commit-actions'

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'
const COMMIT = 'c'.repeat(40)
const ENTRIES = [
  { path: 'a.ts', status: 'modified' as const },
  { path: 'b.ts', status: 'modified' as const }
]
const ITEM: GitHistoryItem = {
  id: COMMIT,
  parentIds: ['p'.repeat(40)],
  subject: 'fix',
  message: 'fix',
  timestamp: 1
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  vi.stubGlobal('window', {
    ...window,
    api: {
      git: {
        commitCompare: vi.fn(async () => ({
          summary: {
            commitOid: COMMIT,
            parentOid: 'p'.repeat(40),
            compareRef: COMMIT.slice(0, 7),
            baseRef: 'p'.repeat(7),
            status: 'ready',
            changedFiles: 1
          },
          entries: ENTRIES
        }))
      }
    }
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderActions() {
  return renderHook(() =>
    useGitHistoryCommitActions({
      activeWorktreeId: REPO,
      editorWorktreeId: FOLDER,
      worktreePath: '/work/repo-1',
      activeRepoTarget: { kind: 'local' },
      resolveSplitTargetGroupId: () => undefined
    })
  )
}

describe("a folder repo's commit combined diff (fork)", () => {
  it('opens in the folder and keeps the repo as its git owner', async () => {
    const { result } = renderActions()

    await result.current.openHistoryCommitDiff(ITEM)

    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({
        mode: 'diff',
        worktreeId: FOLDER,
        gitWorktreeId: REPO,
        commitCompare: expect.objectContaining({ commitOid: COMMIT })
      })
    ])
  })

  it('opens a commit file that can step to the next file in the list it was shown in', async () => {
    const { result } = renderActions()
    await result.current.loadCommitFiles(ITEM)

    result.current.openCommitFile(ITEM, ENTRIES[0]!, undefined, {
      sequence: commitFileTargets(ITEM, ENTRIES)
    })

    const [tab] = useAppStore.getState().openFiles
    expect(tab).toMatchObject({ worktreeId: FOLDER, gitWorktreeId: REPO, relativePath: 'a.ts' })
    expect(getDiffFilePosition(tab!)).toMatchObject({ index: 0, total: 2 })
  })
})
