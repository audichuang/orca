// @vitest-environment happy-dom
// Fork seam guard: a branch row clicked in a folder repo section opens its diff in the folder's editor
// through the real store, keeping the repo as the tab's git owner.
import { act, renderHook } from '@testing-library/react'
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

it('keeps the folder file row active and opens its working-tree diff with repo ownership', () => {
  useAppStore.setState({ activeWorktreeId: FOLDER })
  useAppStore.getState().openFile({
    filePath: '/work/repo-1/src/a.ts',
    relativePath: 'repo-1/src/a.ts',
    worktreeId: FOLDER,
    language: 'typescript',
    mode: 'edit'
  })
  const entry = { path: 'src/a.ts', status: 'modified' as const, area: 'unstaged' as const }
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
        visibleSelectionEntries: [{ key: 'unstaged::src/a.ts', entry, area: 'unstaged' }],
        branchSummary: null
      }),
    { wrapper }
  )
  expect([...result.current.activeOpenRowKeys]).toEqual(['unstaged::src/a.ts'])
  act(() => result.current.handleOpenDiff(entry))
  expect(useAppStore.getState().openFiles.find((file) => file.mode === 'diff')).toMatchObject({
    worktreeId: FOLDER,
    relativePath: 'src/a.ts'
  })
})
