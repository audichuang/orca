// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { sourceControlActionRecipeEntry } from '../../../../shared/source-control-action-selection'
import {
  cleanupFolderSourceControl,
  FOLDER,
  resetFolderSourceControl,
  REPO
} from './source-control/panel/folder-source-control-test-fixture'
import { useSourceControlAgentActionStart } from './useSourceControlAgentActionStart'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

it('uses the updated repo cwd when the action start hook rerenders', async () => {
  const args = {
    open: true,
    connectionId: null,
    selectedAgent: 'codex' as const,
    commandInput: 'Fix the hook.',
    trimmedCommandInput: 'Fix the hook.',
    agentArgsApply: true,
    recipe: sourceControlActionRecipeEntry({ agentId: 'codex' }),
    saveLaunchRecipe: false,
    saveTargetValue: 'none',
    actionId: 'fixCommitFailure' as const,
    repoId: REPO.id,
    agentLaunchPreferences: { defaultTuiAgent: 'codex' as const, disabledTuiAgents: [] },
    settings: useAppStore.getState().settings,
    repo: REPO,
    worktreeId: FOLDER,
    promptDelivery: 'auto-submit' as const,
    launchPlatform: 'linux' as const,
    launchSource: 'source_control_recovery' as const,
    connectionUnavailable: false,
    detectedAgents: ['codex' as const],
    onClose: () => {}
  }
  const { result, rerender } = renderHook(
    ({ initialCwd }) => useSourceControlAgentActionStart({ ...args, initialCwd }),
    { initialProps: { initialCwd: '/work/folder' } }
  )
  rerender({ initialCwd: REPO.path })
  await act(() => result.current.handleStart())
  expect(Object.values(useAppStore.getState().pendingInitialCwdByTabId)).toEqual([REPO.path])
})
