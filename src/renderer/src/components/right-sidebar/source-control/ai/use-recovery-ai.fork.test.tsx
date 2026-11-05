// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { sourceControlActionRecipeEntry } from '../../../../../../shared/source-control/ai/recipes/source-control-action-selection'
import {
  cleanupFolderSourceControl,
  FOLDER,
  OTHER_FOLDER,
  resetFolderSourceControl,
  REPO,
  WORKTREE
} from '../panel/folder-source-control-test-fixture'
import { useSourceControlRecoveryAi } from './use-recovery-ai'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

it.each(['commit', 'push'] as const)(
  'keeps a %s recovery launch in the current folder when its scope changes',
  async (kind) => {
    const params = {
      activeWorktreeId: WORKTREE.id,
      activeGroupId: null,
      activeSourceControlLaunchPlatform: 'linux' as const,
      worktreePath: REPO.path,
      commitMessage: '',
      commitError: 'pre-commit hook failed',
      pushRecoveryPrompt: 'Fix the pre-push hook.',
      stagedEntries: [],
      getLaunchActionRecipe: () => sourceControlActionRecipeEntry({ agentId: 'codex' }),
      getStoreState: useAppStore.getState
    }
    const { result, rerender } = renderHook(
      ({ editorWorktreeId }) => useSourceControlRecoveryAi({ ...params, editorWorktreeId }),
      { initialProps: { editorWorktreeId: FOLDER } }
    )
    rerender({ editorWorktreeId: OTHER_FOLDER })
    // The launch then waits for the agent to take its prompt, which no PTY here ever does.
    act(
      () =>
        void (kind === 'commit'
          ? result.current.handleFixCommitFailureWithAI()
          : result.current.handleFixPushFailureWithAI())
    )
    await vi.waitFor(() =>
      expect(useAppStore.getState().tabsByWorktree[OTHER_FOLDER]).toEqual([
        expect.objectContaining({ worktreeId: OTHER_FOLDER })
      ])
    )
    expect(Object.values(useAppStore.getState().pendingInitialCwdByTabId)).toEqual([REPO.path])
  }
)
