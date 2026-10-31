// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
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
import { useSourceControlPanelModel } from './use-panel-model'
import { SourceControlPanelDialogs } from './panel-dialogs'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

it('launches the panel conflict composer in the folder at the repo cwd before an editor override exists', async () => {
  const { result } = renderHook(useSourceControlPanelModel, { wrapper: FolderScope })
  act(() => result.current.setResolveConflictsComposerOpen(true))
  render(
    <FolderScope>
      <SourceControlPanelDialogs
        activeRepo={REPO}
        activeWorktree={WORKTREE}
        currentWorktreeId={WORKTREE.id}
        worktreePath={REPO.path}
        model={result.current}
      />
    </FolderScope>
  )
  const start = await screen.findByRole('button', { name: /start agent/i })
  await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false))
  fireEvent.click(start)
  await waitFor(() =>
    expect(Object.values(useAppStore.getState().pendingInitialCwdByTabId)).toEqual([REPO.path])
  )
  expect(useAppStore.getState().tabsByWorktree[FOLDER]).toHaveLength(1)
})
