// Fork seam guard: git.diff skipRenderLimit survives RPC -> zod -> RuntimeGitDiffCommands -> LocalGitProvider -> getDiff.
import './rpc/unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from './orca-runtime'
import { RpcDispatcher } from './rpc/dispatcher'
import { GIT_METHODS } from './rpc/methods/git'
import { RuntimeGitDiffCommands } from './runtime-git-diff-commands'

const getDiff = vi.hoisted(() => vi.fn())
vi.mock('../git/source-control/file-diff', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDiff
}))

async function dispatchDiff(extra: Record<string, unknown>): Promise<void> {
  getDiff.mockResolvedValue({
    kind: 'text',
    originalContent: '',
    modifiedContent: 'x',
    originalIsBinary: false,
    modifiedIsBinary: false
  })
  const deps = {
    resolveRuntimeGitTarget: async () => ({
      worktree: { path: '/workspace/feature' },
      executionHostId: 'local'
    })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: getRuntimeGitDiff only resolves the target.
  const commands = new RuntimeGitDiffCommands(deps as never)
  const runtimeMembers = {
    getRuntimeId: () => 'test-runtime',
    getRuntimeGitDiff: commands.getRuntimeGitDiff.bind(commands)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: git.diff only calls these two members.
  const runtime = runtimeMembers as unknown as OrcaRuntimeService
  const response = await new RpcDispatcher({ runtime, methods: GIT_METHODS }).dispatch({
    id: 'r1',
    authToken: 'tok',
    method: 'git.diff',
    params: { worktree: 'id:wt-1', filePath: 'a.ts', staged: true, ...extra }
  })
  expect(response).toMatchObject({ ok: true })
}

describe('git.diff skipRenderLimit through the paired-server chain (fork)', () => {
  it("reaches getDiff's options", async () => {
    await dispatchDiff({ skipRenderLimit: true })
    expect(getDiff).toHaveBeenLastCalledWith(
      '/workspace/feature',
      'a.ts',
      true,
      undefined,
      expect.objectContaining({ admissionTier: 'interactive', skipRenderLimit: true })
    )
  })

  it('leaves the limit on when the client does not ask to skip it', async () => {
    await dispatchDiff({})
    expect(getDiff.mock.lastCall?.[4]?.skipRenderLimit).not.toBe(true)
  })
})
