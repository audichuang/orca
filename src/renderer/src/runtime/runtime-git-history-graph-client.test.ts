// Fork seam guard: the renderer's git history client must pass `graph` on the local IPC and remote RPC routes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeGitHistory } from './runtime-git-status-client'

const callRuntimeRpc = vi.hoisted(() => vi.fn())
vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRuntimeGitHistory (fork graph extension)', () => {
  it('forwards graph to window.api.git.history for a local repo', async () => {
    const history = vi.fn().mockResolvedValue({ items: [], hasMore: false })
    vi.stubGlobal('window', { api: { git: { history } } })
    const graph = { mode: 'head' as const, search: { author: 'ann' }, limit: 100 }

    await getRuntimeGitHistory(
      { target: { kind: 'local' }, worktreeId: 'wt-1', worktreePath: '/repo' },
      { limit: 50, graph }
    )

    expect(history).toHaveBeenCalledWith(expect.objectContaining({ worktreePath: '/repo', graph }))
  })

  it('sends graph in the git.history RPC for a paired server', async () => {
    callRuntimeRpc.mockResolvedValue({ items: [], hasMore: false })
    const graph = { mode: 'head' as const, search: { author: 'ann' }, limit: 100 }
    const target = { kind: 'environment' as const, environmentId: 'env-1' }

    await getRuntimeGitHistory(
      { target, worktreeId: 'wt-1', worktreePath: '/repo' },
      { limit: 50, graph }
    )

    expect(callRuntimeRpc).toHaveBeenCalledWith(
      target,
      'git.history',
      expect.objectContaining({ graph }),
      expect.anything()
    )
  })
})
