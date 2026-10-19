import { describe, expect, it, vi } from 'vitest'
import type { CmdJQuickActionContext } from './quick-action-context'
import { getCmdJQuickActions } from './quick-actions'

function context(overrides: Partial<CmdJQuickActionContext> = {}): CmdJQuickActionContext {
  return {
    activeView: 'terminal',
    activeWorktreeId: 'wt-1',
    activeWorktree: null,
    isLoading: false,
    sshStatus: null,
    runtimeMode: 'local-desktop',
    activeGroupId: 'group-1',
    openNewBrowserTab: async () => {},
    openBrowserUrl: async () => {},
    openNewMarkdownFile: async () => {},
    openNewTerminalTab: async () => {},
    openCreateWorkspace: () => {},
    deleteActiveWorkspace: () => {},
    openAddQuickCommand: () => {},
    canOpenGitGraph: true,
    openGitGraph: vi.fn(),
    ...overrides
  }
}

const action = () => getCmdJQuickActions().find((entry) => entry.id === 'open-git-graph')!

describe('Open Git Graph palette action', () => {
  it('is listed and opens the tab for the active workspace', async () => {
    const ctx = context()
    expect(action().isAvailable(ctx)).toEqual({ available: true })
    await expect(action().run(ctx)).resolves.toEqual({ status: 'ok' })
    expect(ctx.openGitGraph).toHaveBeenCalledTimes(1)
  })

  it('is unavailable without a git repo, a workspace view, or a connected host', async () => {
    const unavailable = [
      [context({ canOpenGitGraph: false }), 'no-git-repo'],
      [context({ activeView: 'settings' }), 'no-active-workspace'],
      [context({ activeWorktreeId: null }), 'no-active-workspace']
    ] as const
    for (const [ctx, reason] of unavailable) {
      expect(action().isAvailable(ctx)).toEqual({ available: false, reason })
      await action().run(ctx)
      expect(ctx.openGitGraph).not.toHaveBeenCalled()
    }
    expect(action().isAvailable(context({ sshStatus: 'disconnected' }))).toEqual({
      available: false,
      reason: 'ssh-disconnected'
    })
  })
})
