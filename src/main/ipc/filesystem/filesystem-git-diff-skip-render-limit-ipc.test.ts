// Fork seam guard: the desktop 'git:diff' IPC must forward skipRenderLimit to getDiff.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getDiff: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler)
  }
}))
vi.mock('../../git/source-control/file-diff', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDiff: mocks.getDiff
}))
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
  mocks.getDiff.mockReset().mockResolvedValue({ kind: 'text' })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: git:diff reads only `store`, which the mocked resolvers ignore.
  registerFilesystemGitStatusHandlers({
    store: {},
    gitStatusCancellations: new Map()
  } as unknown as FilesystemHandlerContext)
})

describe("'git:diff' IPC (fork skipRenderLimit)", () => {
  it('forwards skipRenderLimit to getDiff', async () => {
    await mocks.handlers.get('git:diff')?.(
      {},
      { worktreePath: '/repo', filePath: 'a.ts', staged: true, skipRenderLimit: true }
    )
    expect(mocks.getDiff).toHaveBeenCalledWith(
      '/repo',
      'a.ts',
      true,
      undefined,
      expect.anything(),
      true
    )
  })

  it('leaves the limit on when the caller does not ask to skip it', async () => {
    await mocks.handlers.get('git:diff')?.(
      {},
      { worktreePath: '/repo', filePath: 'a.ts', staged: true }
    )
    expect(mocks.getDiff.mock.lastCall?.[5]).not.toBe(true)
  })
})
