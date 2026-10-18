// Fork seam guard: the renderer's git history client must pass `graph` on the local IPC route.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeGitHistory } from './runtime-git-status-client'

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
})
