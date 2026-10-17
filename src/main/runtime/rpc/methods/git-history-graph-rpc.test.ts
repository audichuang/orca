import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { GIT_METHODS } from './git'

function dispatcherWith(getRuntimeGitHistory: ReturnType<typeof vi.fn>): RpcDispatcher {
  const runtime = { getRuntimeId: () => 'test-runtime', getRuntimeGitHistory }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: git.history only calls these two members of the runtime.
  const service = runtime as unknown as OrcaRuntimeService
  return new RpcDispatcher({ runtime: service, methods: GIT_METHODS })
}

describe('git.history graph extension', () => {
  it('forwards the graph request to the runtime', async () => {
    const getRuntimeGitHistory = vi.fn().mockResolvedValue({ items: [], hasMore: false })
    const graph = {
      mode: 'all',
      source: { local: true, remotes: ['origin'] },
      search: { text: 'fix', author: 'ann', path: 'src/a.ts' },
      limit: 600
    }

    const response = await dispatcherWith(getRuntimeGitHistory).dispatch({
      id: 'req-1',
      authToken: 'tok',
      method: 'git.history',
      params: { worktree: 'id:wt-1', limit: 200, graph }
    })

    expect(response).toMatchObject({ ok: true })
    expect(getRuntimeGitHistory).toHaveBeenCalledWith('id:wt-1', {
      limit: 200,
      baseRef: undefined,
      graph
    })
  })

  it('rejects a graph limit above the fork cap before reaching git', async () => {
    const getRuntimeGitHistory = vi.fn()

    const response = await dispatcherWith(getRuntimeGitHistory).dispatch({
      id: 'req-1',
      authToken: 'tok',
      method: 'git.history',
      params: { worktree: 'id:wt-1', graph: { mode: 'head', limit: 100_000 } }
    })

    expect(response).toMatchObject({ ok: false })
    expect(getRuntimeGitHistory).not.toHaveBeenCalled()
  })
})
