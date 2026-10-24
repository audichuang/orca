// Draft: src/main/runtime/rpc/methods/git-diff-skip-render-limit.test.ts
// Pins every hop the fork's ClipCode staged-copy flag travels: RPC params -> runtime -> provider.
import '../unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { GIT_METHODS } from './git'
import { GitDiff } from '../../../../shared/rpc-contract/git-params'

const diffResult = {
  kind: 'text',
  originalContent: '',
  modifiedContent: 'x',
  originalIsBinary: false,
  modifiedIsBinary: false
}

describe('git.diff skipRenderLimit (fork: ClipCode full index text)', () => {
  it('keeps the flag through the zod params schema', () => {
    const parsed = GitDiff.parse({
      worktree: 'id:wt-1',
      filePath: 'a.ts',
      staged: true,
      skipRenderLimit: true
    })
    expect(parsed.skipRenderLimit).toBe(true)
  })

  it("forwards it in runtime.getRuntimeGitDiff's read options", async () => {
    const getRuntimeGitDiff = vi.fn().mockResolvedValue(diffResult)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the two methods the handler calls.
    const runtime = { getRuntimeId: () => 'rt', getRuntimeGitDiff } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: GIT_METHODS })
    await dispatcher.dispatch({
      id: 'r',
      authToken: 't',
      method: 'git.diff',
      params: { worktree: 'id:wt-1', filePath: 'a.ts', staged: true, skipRenderLimit: true }
    })
    expect(getRuntimeGitDiff).toHaveBeenCalledWith('id:wt-1', 'a.ts', true, undefined, undefined, {
      skipRenderLimit: true
    })
  })
})
