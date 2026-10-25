// @vitest-environment happy-dom
// Fork seam guard: a branch row clicked in a folder repo section opens its diff in the folder's editor
// through the real store, keeping the repo as the tab's git owner.
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'
import { useSourceControlRowOpening } from './use-row-opening'

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'
const SCOPE = { gitWorktreeId: REPO, editorWorktreeId: FOLDER }

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('a folder repo section branch row (fork)', () => {
  it('opens the branch diff in the folder editor with the repo as its git owner', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SourceControlWorktreeScopeContext.Provider value={SCOPE}>
        {children}
      </SourceControlWorktreeScopeContext.Provider>
    )
    const { result } = renderHook(
      () =>
        useSourceControlRowOpening({
          activeWorktreeId: REPO,
          worktreePath: '/work/repo-1',
          visibleSelectionEntries: [],
          branchSummary: {
            baseRef: 'main',
            baseOid: 'b'.repeat(40),
            compareRef: 'feature',
            headOid: 'h'.repeat(40),
            mergeBase: 'b'.repeat(40),
            changedFiles: 1,
            status: 'ready'
          }
        }),
      { wrapper }
    )

    result.current.openCommittedDiff({ path: 'src/a.ts', status: 'modified' })

    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({ mode: 'diff', worktreeId: FOLDER, gitWorktreeId: REPO })
    ])
  })
})
