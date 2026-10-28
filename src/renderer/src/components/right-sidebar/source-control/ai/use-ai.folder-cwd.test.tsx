// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../../shared/constants'
import type { TuiAgent } from '../../../../../../shared/tui-agent'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'

const { launchAgent } = vi.hoisted(() => ({ launchAgent: vi.fn() }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: launchAgent }))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({ focusTerminalTabSurface: vi.fn() }))
vi.mock('@/runtime/runtime-git-status-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRuntimeGitMutationInFlight: async () => ({ inFlight: false })
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }))
import { useAppStore } from '@/store'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import {
  makeFolderWorkspace,
  makeWorktree,
  TEST_REPO
} from '@/store/slices/worktrees-slice-test-fixtures'
import { clearHostAgentMenuSettingsForTests } from '@/components/settings/use-host-agent-launch-preferences'
import { useSourceControlAi } from './use-ai'

// Fork: a folder workspace's repo conflicts launch the agent in the folder workspace, started in the repo.
const REPO_WT = `${TEST_REPO.id}::/work/repo-1`
const FOLDER = folderWorkspaceKey('folder-1')
const initialState = useAppStore.getState()

beforeEach(() => {
  launchAgent.mockReset().mockReturnValue({ surface: { kind: 'local-terminal', tabId: 'agent' } })
  setLocalRuntimeCapabilitiesForTests([])
  const ids: TuiAgent[] = ['codex']
  useAppStore.setState({
    isRemoteOperationActive: false,
    repos: [TEST_REPO],
    worktreesByRepo: {
      [TEST_REPO.id]: [makeWorktree({ id: REPO_WT, repoId: TEST_REPO.id, path: '/work/repo-1' })]
    },
    folderWorkspaces: [makeFolderWorkspace({ id: 'folder-1', folderPath: '/work' })],
    localDetectedAgentIdsByContext: { host: ids },
    ensureDetectedAgents: async () => ids
  })
})
afterEach(() => {
  cleanup()
  clearHostAgentMenuSettingsForTests()
  setLocalRuntimeCapabilitiesForTests(null)
  useAppStore.setState(initialState, true)
})

it('starts a saved conflict agent in the folder workspace at the repo directory', async () => {
  const settings = getDefaultSettings('/tmp')
  settings.sourceControlAi!.actions = { resolveConflicts: { agentId: 'codex' } }
  const { result } = renderHook(() =>
    useSourceControlAi({
      settings,
      target: { kind: 'local' },
      activeRepo: TEST_REPO,
      activeWorktreeId: REPO_WT,
      editorWorktreeId: FOLDER,
      activeConnectionId: null,
      activeGroupId: null,
      activeSourceControlLaunchPlatform: 'linux',
      conflictOperation: 'rebase',
      unresolvedConflicts: [{ path: 'a.ts' }],
      stagedEntries: [],
      worktreePath: '/work/repo-1',
      commitMessage: '',
      commitError: null,
      pushRecoveryPrompt: null,
      updateSettings: vi.fn(),
      updateSettingsOrThrow: vi.fn().mockResolvedValue(undefined),
      updateRepo: vi.fn(),
      openSettingsTarget: vi.fn(),
      openSettingsPage: vi.fn()
    })
  )
  await act(() => result.current.handleResolveConflictsWithAI())
  await waitFor(() => expect(launchAgent).toHaveBeenCalledOnce())
  expect(launchAgent).toHaveBeenCalledWith(
    expect.objectContaining({ agent: 'codex', worktreeId: FOLDER, initialCwd: '/work/repo-1' })
  )
})
