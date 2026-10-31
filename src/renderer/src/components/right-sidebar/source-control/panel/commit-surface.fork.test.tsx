// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { SourceControlCommitSurface } from './commit-surface'
import { saveSessionCommitErrors, saveSessionRemoteActionErrors } from './operation-error-session'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

function CommitSurface() {
  const model = useSourceControlPanelModel()
  return (
    <SourceControlCommitSurface
      activeRepo={REPO}
      activeWorktree={WORKTREE}
      currentWorktreeId={WORKTREE.id}
      worktreePath={REPO.path}
      model={model}
      showGenericEmptyState={false}
    />
  )
}

it.each(['commit', 'push'] as const)(
  'customizes a %s recovery launch from the folder repo notice with the repo cwd',
  async (kind) => {
    if (kind === 'commit') {
      saveSessionCommitErrors({ [WORKTREE.id]: 'pre-commit hook failed' })
    } else {
      saveSessionRemoteActionErrors({
        [WORKTREE.id]: {
          kind: 'push',
          message: 'pre-push hook failed',
          rawError: 'pre-push hook failed',
          worktreePath: REPO.path
        }
      })
    }
    render(
      <FolderScope>
        <CommitSurface />
      </FolderScope>
    )
    fireEvent.pointerDown(
      screen.getByRole('button', { name: `Choose agent to fix ${kind} failure` }),
      { button: 0, ctrlKey: false }
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Customize launch...' }))
    const start = await screen.findByRole('button', { name: /start agent/i })
    await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false))
    fireEvent.click(start)
    await waitFor(() =>
      expect(Object.values(useAppStore.getState().pendingInitialCwdByTabId)).toEqual([REPO.path])
    )
    expect(useAppStore.getState().tabsByWorktree[FOLDER]).toHaveLength(1)
  }
)
