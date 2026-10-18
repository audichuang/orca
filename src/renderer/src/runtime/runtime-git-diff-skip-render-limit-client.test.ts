// Fork seam guard: the renderer diff client forwards skipRenderLimit on both the local IPC and remote RPC routes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRuntimeGitDiff } from './runtime-git-diff-client'

const callRuntimeRpc = vi.hoisted(() => vi.fn())
vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

const diff = vi.fn()
const args = { filePath: 'a.ts', staged: true }
const local = { target: { kind: 'local' as const }, worktreeId: 'wt-1', worktreePath: '/repo' }
const remote = {
  target: { kind: 'environment' as const, environmentId: 'env-1' },
  worktreeId: 'wt-1',
  worktreePath: '/repo'
}

beforeEach(() => {
  callRuntimeRpc.mockReset().mockResolvedValue({})
  diff.mockReset().mockResolvedValue({})
  vi.stubGlobal('window', { api: { git: { diff } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRuntimeGitDiff skipRenderLimit (fork)', () => {
  it('passes it to window.api.git.diff for a local repo', async () => {
    await getRuntimeGitDiff(local, { ...args, skipRenderLimit: true })
    expect(diff).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repo', skipRenderLimit: true })
    )
  })

  it('sends it in the git.diff RPC for a paired server', async () => {
    await getRuntimeGitDiff(remote, { ...args, skipRenderLimit: true })
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      remote.target,
      'git.diff',
      expect.objectContaining({ filePath: 'a.ts', skipRenderLimit: true }),
      expect.anything()
    )
  })

  it('omits the field from the RPC when unset so older servers see the same request', async () => {
    await getRuntimeGitDiff(remote, args)
    expect(callRuntimeRpc.mock.calls[0][2]).not.toHaveProperty('skipRenderLimit')
  })
})
