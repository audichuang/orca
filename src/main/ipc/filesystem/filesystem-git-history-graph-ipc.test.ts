// Fork seam guard: the desktop 'git:history' IPC must forward the optional `graph` request.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getHistory: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler)
  }
}))
vi.mock('../../git/history', () => ({ getHistory: mocks.getHistory }))
vi.mock('../registered-worktree-roots-cache', () => ({
  resolveRegisteredWorktreePath: async (path: string) => path
}))
vi.mock('../local-worktree-runtime-options', () => ({
  getLocalGitOptionsForRegisteredWorktree: () => ({}),
  getLocalGitOptionsForRepo: () => ({}),
  getLocalRepoForRegisteredWorktree: () => undefined
}))
vi.mock('../../providers/execution-host-provider-dispatch', () => ({
  requireReachableGitRoute: () => undefined
}))

import { registerFilesystemGitStatusHandlers } from './filesystem-git-status-handlers'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

beforeEach(() => {
  mocks.handlers.clear()
  mocks.getHistory.mockReset().mockResolvedValue({ items: [], hasMore: false })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: git:history reads only `store`, which the mocked resolvers ignore.
  registerFilesystemGitStatusHandlers({
    store: {},
    gitStatusCancellations: new Map()
  } as unknown as FilesystemHandlerContext)
})

describe("'git:history' IPC (fork graph extension)", () => {
  it('forwards graph to getHistory', async () => {
    const graph = {
      mode: 'all',
      source: { local: true, remotes: ['origin'], tags: true },
      listTags: true,
      limit: 600
    }
    await mocks.handlers.get('git:history')?.({}, { worktreePath: '/repo', limit: 50, graph })
    expect(mocks.getHistory).toHaveBeenCalledWith('/repo', expect.objectContaining({ graph }))
  })
})
