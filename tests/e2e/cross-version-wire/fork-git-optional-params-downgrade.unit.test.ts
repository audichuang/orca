// Fork client against the latest upstream release host: the optional `skipRenderLimit`
// field must parse there (the release schemas strip them) and the client's fallbacks must hold
// on the data that release really produces.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildClipcodeGitCopy } from '../../../src/renderer/src/components/right-sidebar/source-control/clipcode/clipcode-git-copy'
import { getRuntimeGitDiff } from '../../../src/renderer/src/runtime/source-control/git/runtime-git-diff-client'
import type { GitDiffResult } from '../../../src/shared/git/diff/git-diff-compare-types'
import type { RuntimeGitContext } from '../../../src/renderer/src/runtime/source-control/git/runtime-git-client-context'
import {
  importReleaseCheckoutModule,
  materializeReleaseCheckout,
  releaseModuleExport,
  resolveBaselineReleaseRef
} from './release-checkout'

const callRuntimeRpc = vi.hoisted(() => vi.fn())
vi.mock('../../../src/renderer/src/runtime/rpc/calls/runtime-rpc-call', () => ({
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

const SUITE_TIMEOUT_MS = 180_000
const target = { kind: 'environment' as const, environmentId: 'env-1' }
const context: RuntimeGitContext = {
  target,
  worktreeId: 'repo-1::/work/repo',
  worktreePath: '/work/repo'
}
type Parser = {
  safeParse: (value: unknown) => { success: boolean; data?: Record<string, unknown> }
}
type BuildDiffResult = (
  original: string,
  modified: string,
  originalIsBinary: boolean,
  modifiedIsBinary: boolean,
  filePath?: string
) => GitDiffResult

let gitDiff: Parser
let releaseBuildDiffResult: BuildDiffResult

beforeAll(async () => {
  const checkout = await materializeReleaseCheckout(resolveBaselineReleaseRef())
  const [params, diffResult] = await Promise.all([
    importReleaseCheckoutModule(checkout, 'src/shared/rpc-contract/git-params.ts'),
    importReleaseCheckoutModule(checkout, 'src/main/git/source-control/diff-result.ts')
  ])
  gitDiff = releaseModuleExport<Parser>(params, 'GitDiff')
  releaseBuildDiffResult = releaseModuleExport<BuildDiffResult>(diffResult, 'buildDiffResult')
}, SUITE_TIMEOUT_MS)

beforeEach(() => {
  callRuntimeRpc.mockReset()
})

function sentParams(method: string): Record<string, unknown> {
  const call = callRuntimeRpc.mock.calls.find(([, name]) => name === method)
  if (!call) {
    throw new Error(`no ${method} request was sent`)
  }
  return call[2]
}

describe('skipRenderLimit on a release host', () => {
  it('is sent, parses on the release host and is dropped', async () => {
    callRuntimeRpc.mockResolvedValue({})
    await getRuntimeGitDiff(context, { filePath: 'a.ts', staged: true, skipRenderLimit: true })
    const params = sentParams('git.diff')
    expect(params.skipRenderLimit).toBe(true)
    const parsed = gitDiff.safeParse(params)
    expect(parsed.success).toBe(true)
    expect(parsed.data).not.toHaveProperty('skipRenderLimit')
    expect(parsed.data?.staged).toBe(true)
  })

  it('ClipCode writes a size-skip line for what a release host blanks, not the working tree', async () => {
    // A release host ignores the flag: its real producer blanks both sides over the render limit.
    const release = releaseBuildDiffResult(
      'a'.repeat(3_100_000),
      'b'.repeat(3_100_000),
      false,
      false
    )
    expect(release.kind === 'text' && release.largeDiffRenderLimit?.limited).toBe(true)
    const readDiff = vi.fn(async () => release)
    const result = await buildClipcodeGitCopy({
      rootPath: '/work/repo',
      repos: [
        {
          context,
          entries: [{ path: 'big.txt', status: 'modified', area: 'staged' }],
          forceIndexForStaged: true
        }
      ],
      readers: {
        readDiff,
        readWorkingFile: vi.fn(async () => ({ content: 'WORKING-TREE-TEXT', isBinary: false }))
      }
    })
    expect(readDiff).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ staged: true, skipRenderLimit: true })
    )
    expect(result.payload).toContain(
      '// File skipped: size exceeds limit (staged version too large to read)'
    )
    expect(result.payload).not.toContain('WORKING-TREE-TEXT')
    expect(result.skippedFileSizeCount).toBe(1)
  })
})
