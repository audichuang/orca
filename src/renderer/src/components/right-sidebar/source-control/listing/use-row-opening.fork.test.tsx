// @vitest-environment happy-dom
// Fork seam guard: a branch row clicked in a folder repo section opens its diff in the folder's editor
// through the real store, keeping the repo as the tab's git owner.
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'
import { useSourceControlRowOpening } from './use-row-opening'

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'
const SCOPE = { gitWorktreeId: REPO, editorWorktreeId: FOLDER }
const NO_OWNER_SCOPE = { gitWorktreeId: REPO, editorWorktreeId: '' }

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
          visibleBranchRowKeys: [],
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
        visibleBranchRowKeys: [],
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

it('opens nothing when no editor owner resolves for the tab', () => {
  const entry = { path: 'src/a.ts', status: 'modified' as const, area: 'unstaged' as const }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SourceControlWorktreeScopeContext.Provider value={NO_OWNER_SCOPE}>
      {children}
    </SourceControlWorktreeScopeContext.Provider>
  )
  const { result } = renderHook(
    () =>
      useSourceControlRowOpening({
        activeWorktreeId: REPO,
        worktreePath: '/work/repo-1',
        visibleSelectionEntries: [],
        visibleBranchRowKeys: [],
        branchSummary: null
      }),
    { wrapper }
  )
  act(() => result.current.handleOpenDiff(entry))
  expect(useAppStore.getState().openFiles).toEqual([])
})

it('splits the folder editor, not the repo, on an Alt-click in a folder repo section', () => {
  const group = (id: string, worktreeId: string) => ({
    id,
    worktreeId,
    activeTabId: null,
    tabOrder: []
  })
  const createEmptySplitGroup = vi.fn(() => 'split-new')
  useAppStore.setState({
    groupsByWorktree: { [FOLDER]: [group('folder-g', FOLDER)], [REPO]: [group('repo-g', REPO)] },
    activeGroupIdByWorktree: { [FOLDER]: 'folder-g', [REPO]: 'repo-g' },
    createEmptySplitGroup
  })
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
        visibleBranchRowKeys: [],
        branchSummary: null
      }),
    { wrapper }
  )
  const alt = { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
  expect(result.current.resolveSplitTargetGroupId(alt)).toBe('split-new')
  expect(createEmptySplitGroup).toHaveBeenCalledExactlyOnceWith(FOLDER, 'folder-g', 'right')
})
