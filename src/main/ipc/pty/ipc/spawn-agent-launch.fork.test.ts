import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetAgentLaunchPanesForTests } from '../../../agent-launch/agent-launch-pane-attachment'
import { planPaneAgentLaunch } from './spawn-agent-launch'
import type { PtyIpcSpawnState } from './spawn-state'

// A folder workspace's AI button names one repo as its cwd while the pane sits at the folder root.
describe('a pane that starts its own agent launch inside a folder repo', () => {
  const worktreeId = 'repo-1::/tmp/pane-launch'

  afterEach(() => {
    resetAgentLaunchPanesForTests()
  })

  it("starts in the launch's cwd, not the pane's workspace root", async () => {
    const runtime = {
      showTerminalWorkspaceLaunchScope: vi.fn(async () => ({
        id: worktreeId,
        path: '/tmp/pane-launch',
        connectionId: null,
        repo: null,
        folderWorkspace: null
      })),
      planAgentPaneLaunch: vi.fn(async () => ({ command: 'claude' }))
    }
    const ctx = {
      deps: { runtime },
      args: {
        cols: 132,
        rows: 40,
        cwd: '/tmp/pane-launch',
        worktreeId,
        tabId: 'tab-pane-launch',
        leafId: '66666666-6666-4666-8666-666666666666',
        command: '',
        agentLaunch: {
          launch: {
            agent: 'claude',
            target: { kind: 'existing', worktree: `id:${worktreeId}` },
            cwd: '/tmp/pane-launch/libs/core'
          }
        }
      },
      earlyStablePaneOwner: null
    }

    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: planPaneAgentLaunch reads only deps.runtime, args and earlyStablePaneOwner.
    await planPaneAgentLaunch(ctx as unknown as PtyIpcSpawnState)

    expect(ctx.args.cwd).toBe('/tmp/pane-launch/libs/core')
  })
})
