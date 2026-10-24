import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'

const mocks = vi.hoisted(() => ({
  launchAgentInNewTab: vi.fn(),
  toastError: vi.fn(),
  // As the route decides: a start directory below the folder root (/work) cannot open as a chat.
  mayOpenAsChat: vi.fn((_workspace: unknown, cwd?: string | null) => !cwd || cwd === '/work')
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launchAgentInNewTab }))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => null }))
// The host offers codex as a chat although its CLI was not detected.
vi.mock('@/lib/host-chat-program-acquisition', () => ({
  acquireAgentLaunchChoices: async () => ({ detected: [], offered: ['codex'] })
}))
vi.mock('@/lib/host-chat-program', () => ({
  agentChoiceMayOpenAsChat: (
    _state: unknown,
    _agent: unknown,
    workspace: unknown,
    _detected: unknown,
    launchAt?: { cwd?: string | null }
  ) => mocks.mayOpenAsChat(workspace, launchAt?.cwd)
}))

const { launchSourceControlRecoveryAgentWithDefault, getDefaultSourceControlRecoveryLaunchCopy } =
  await import('./recovery-launch')

const REPO = 'repo-1::/work/repo-1'
const FOLDER = folderWorkspaceKey('folder-1')
const copy = getDefaultSourceControlRecoveryLaunchCopy('commit')

function launch(editorWorktreeId: string | undefined): Promise<boolean> {
  return launchSourceControlRecoveryAgentWithDefault({
    activeWorktreeId: REPO,
    editorWorktreeId,
    worktreePath: '/work/repo-1',
    activeGroupId: null,
    activeSourceControlLaunchPlatform: 'darwin',
    actionId: 'fixCommitFailure',
    basePrompt: 'Fix the commit.',
    getLaunchActionRecipe: () => ({ agentId: 'codex', commandInputTemplate: '{basePrompt}' }),
    getStoreState: () => useAppStore.getState(),
    copy
  })
}

describe('source control recovery launch from a folder workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.launchAgentInNewTab.mockReturnValue({ surface: { kind: 'structured-chat' } })
  })

  it('launches a chat-only saved agent in the repo worktree itself', async () => {
    await expect(launch(undefined)).resolves.toBe(true)
    expect(mocks.launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'codex', worktreeId: REPO, initialCwd: undefined })
    )
  })

  it('refuses a chat-only saved agent when the launch starts in a repo below the folder root', async () => {
    await expect(launch(FOLDER)).resolves.toBe(false)
    expect(mocks.mayOpenAsChat).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: FOLDER }),
      '/work/repo-1'
    )
    expect(mocks.toastError).toHaveBeenCalledWith(copy.savedAgentUnavailable)
    expect(mocks.launchAgentInNewTab).not.toHaveBeenCalled()
  })
})
