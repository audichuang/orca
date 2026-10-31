// @vitest-environment happy-dom
import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  cleanupFolderSourceControl,
  FolderScope,
  FOLDER,
  resetFolderSourceControl,
  REPO,
  WORKTREE
} from './folder-source-control-test-fixture'
import { SourceControlPanelReady } from './panel-ready'
import { useSourceControlPanelModel } from './use-panel-model'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

it('launches repo recovery through the panel in the folder with the repo cwd', async () => {
  const { result } = renderHook(useSourceControlPanelModel, { wrapper: FolderScope })
  act(() => result.current.setCommitErrorForWorktree(WORKTREE.id, 'pre-commit hook failed'))
  await act(() => result.current.handleFixCommitFailureWithAI())
  expect(Object.values(useAppStore.getState().pendingInitialCwdByTabId)).toEqual([REPO.path])
  expect(useAppStore.getState().tabsByWorktree[FOLDER]).toHaveLength(1)
})

it('opens a repo note through the panel into the folder editor', () => {
  const { result } = renderHook(useSourceControlPanelModel, { wrapper: FolderScope })
  act(() =>
    result.current.handleOpenComment({
      id: 'note',
      worktreeId: WORKTREE.id,
      filePath: 'a.ts',
      lineNumber: 1,
      body: 'check',
      side: 'modified',
      createdAt: 1
    })
  )
  expect(useAppStore.getState().openFiles).toEqual([
    expect.objectContaining({
      worktreeId: FOLDER,
      gitWorktreeId: WORKTREE.id,
      filePath: `${REPO.path}/a.ts`
    })
  ])
})

it('shows the scoped repo name in the folder toolbar', () => {
  const { result } = renderHook(useSourceControlPanelModel, { wrapper: FolderScope })
  render(
    <FolderScope>
      <SourceControlPanelReady
        activeRepo={REPO}
        activeWorktree={WORKTREE}
        currentWorktreeId={WORKTREE.id}
        worktreePath={REPO.path}
        model={result.current}
      />
    </FolderScope>
  )
  expect(screen.getByTitle('repo-a').textContent).toBe('repo-a')
})
