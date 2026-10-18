// Fork seam guard: git.history RPC -> zod -> RuntimeGitStatusCommands -> LocalGitProvider -> getHistory keeps `graph`.
import './rpc/unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from './orca-runtime'
import { RpcDispatcher } from './rpc/dispatcher'
import { GIT_METHODS } from './rpc/methods/git'
import { RuntimeGitStatusCommands } from './runtime-git-status-commands'

const getHistory = vi.hoisted(() => vi.fn())
vi.mock('../git/history', () => ({ getHistory }))

describe('git.history graph through the paired-server chain (fork)', () => {
  it('reaches getHistory with graph intact and returns the echoed graph', async () => {
    const applied = { mode: 'all', refs: [], remotes: [], limit: 300 }
    getHistory.mockResolvedValue({ items: [], hasMore: false, graph: applied })
    const deps = {
      resolveRuntimeGitTarget: async () => ({
        worktree: { path: '/workspace/feature' },
        executionHostId: 'local'
      })
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: getRuntimeGitHistory only resolves the target.
    const commands = new RuntimeGitStatusCommands(deps as never)
    const runtimeMembers = {
      getRuntimeId: () => 'test-runtime',
      getRuntimeGitHistory: commands.getRuntimeGitHistory.bind(commands)
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: git.history only calls these two members.
    const runtime = runtimeMembers as unknown as OrcaRuntimeService
    const graph = {
      mode: 'all',
      source: { local: true, remotes: 'all' },
      search: { text: 'fix' },
      limit: 300
    }

    const response = await new RpcDispatcher({ runtime, methods: GIT_METHODS }).dispatch({
      id: 'r1',
      authToken: 'tok',
      method: 'git.history',
      params: { worktree: 'id:wt-1', limit: 50, graph }
    })

    expect(response).toMatchObject({ ok: true, result: { graph: applied } })
    expect(getHistory).toHaveBeenCalledWith(
      '/workspace/feature',
      expect.objectContaining({ graph })
    )
  })
})
