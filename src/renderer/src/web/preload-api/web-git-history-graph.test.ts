// @vitest-environment happy-dom
// Fork seam guard: the web client must forward the optional `graph` request of git.history.
import { describe, expect, it, vi } from 'vitest'

const callRuntimeResult = vi.hoisted(() => vi.fn())
vi.mock('./web-runtime-calls', () => ({ callRuntimeResult }))
vi.mock('./web-runtime-worktree-catalog', () => ({
  resolveRuntimeWorktreeByPath: async () => ({ id: 'wt-1' }),
  resolveRuntimeFilePath: vi.fn()
}))

import { createGitApi } from './web-git-api'

describe('web git.history (fork graph extension)', () => {
  it('sends graph through to the runtime', async () => {
    callRuntimeResult.mockResolvedValue({ items: [], hasMore: false })
    const graph = { mode: 'refs' as const, refs: ['refs/heads/main'], limit: 100 }
    await createGitApi().history!({ worktreePath: '/repo', limit: 50, graph })
    expect(callRuntimeResult).toHaveBeenCalledWith(
      'git.history',
      expect.objectContaining({ worktree: 'id:wt-1', graph })
    )
  })
})
