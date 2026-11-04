// @vitest-environment happy-dom
import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
import { commitFileTargets } from '../sync/commit-file-sequence'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { useSourceControlPanelModel } from './use-panel-model'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

it('launches repo recovery through the panel in the folder with the repo cwd', async () => {
  const { result } = renderHook(useSourceControlPanelModel, { wrapper: FolderScope })
  act(() => result.current.setCommitErrorForWorktree(WORKTREE.id, 'pre-commit hook failed'))
  // The launch then waits for the agent to take its prompt, which no PTY here ever does.
  act(() => void result.current.handleFixCommitFailureWithAI())
  await vi.waitFor(() =>
    expect(Object.values(useAppStore.getState().pendingInitialCwdByTabId)).toEqual([REPO.path])
  )
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

it('opens a repo commit file through the panel into the folder editor', async () => {
  const item: GitHistoryItem = {
    id: 'c'.repeat(40),
    parentIds: ['p'.repeat(40)],
    subject: 'fix',
    message: 'fix',
    timestamp: 1
  }
  const entries = [{ path: 'a.ts', status: 'modified' as const }]
  const api = resetFolderSourceControl()
  const commitCompare = vi.fn(async () => ({
    summary: {
      commitOid: item.id,
      parentOid: item.parentIds[0],
      compareRef: item.id.slice(0, 7),
      baseRef: 'p'.repeat(7),
      status: 'ready',
      changedFiles: 1
    },
    entries
  }))
  vi.stubGlobal('api', { ...api, git: { ...api.git, commitCompare } })
  const { result } = renderHook(useSourceControlPanelModel, { wrapper: FolderScope })
  await act(async () => {
    await result.current.loadCommitFiles(item)
  })
  expect(commitCompare).toHaveBeenCalled()
  act(() =>
    result.current.openCommitFile(item, entries[0]!, undefined, {
      sequence: commitFileTargets(item, entries)
    })
  )
  expect(useAppStore.getState().openFiles).toEqual([
    expect.objectContaining({
      worktreeId: FOLDER,
      gitWorktreeId: WORKTREE.id,
      relativePath: 'a.ts'
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
