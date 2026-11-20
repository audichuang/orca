import { describe, expect, it, vi } from 'vitest'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { RuntimeRpcCallError } from '@/runtime/rpc/calls/runtime-rpc-result'
import type { RuntimeGitContext } from '@/runtime/source-control/git/runtime-git-client-context'
import { CLIPCODE_DEFAULTS, DELETED_FILE_MARKER, parseClipboard } from './clipcode-clipboard-format'
import { buildClipcodeCommitCopy } from './clipcode-commit-copy'
import { clipcodeCommitReaders, clipcodeRuntimeReaders } from './clipcode-copy-action'
import { buildClipcodeGitCopy } from './clipcode-git-copy'

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: vi.fn() }))

const context: RuntimeGitContext = {
  target: { kind: 'environment', environmentId: 'server' },
  worktreeId: 'repo::/work/wt',
  worktreePath: '/work/wt'
}
const PARENT_1 = '1'.repeat(40)
const tooLarge = new RuntimeRpcCallError({
  id: 'diff',
  ok: false,
  error: { code: 'diff_too_large', message: 'This diff is too large.' }
})
const PARENT_2 = '2'.repeat(40)

describe('ClipCode commit copy on a remote host past the diff reply budget', () => {
  it('reads a merge-deleted file from the next parent when the first is too large to send', async () => {
    vi.mocked(callRuntimeRpc).mockImplementation(async (_target, _method, params) => {
      if (JSON.stringify(params).includes(PARENT_1)) {
        throw tooLarge
      }
      return {
        kind: 'text',
        originalContent: 'second parent text',
        modifiedContent: '',
        originalIsBinary: false,
        modifiedIsBinary: false,
        missingSides: ['modified']
      }
    })

    const result = await buildClipcodeCommitCopy({
      rootPath: context.worktreePath,
      context,
      commits: [
        {
          commitOid: 'a'.repeat(40),
          parentOids: [PARENT_1, PARENT_2],
          entries: [{ path: 'gone.ts', status: 'deleted' }]
        }
      ],
      readers: clipcodeCommitReaders
    })

    const files = parseClipboard(result.payload, CLIPCODE_DEFAULTS.headerFormat)
    expect(files.map((file) => [file.path, file.content.trimEnd()])).toEqual([
      ['gone.ts', 'second parent text']
    ])
  })

  it('keeps the deletion marker for a deleted file whose HEAD side is too large to send', async () => {
    vi.mocked(callRuntimeRpc).mockRejectedValue(tooLarge)

    const result = await buildClipcodeGitCopy({
      rootPath: context.worktreePath,
      repos: [
        {
          context,
          entries: [{ path: 'gone.ts', status: 'deleted', area: 'unstaged' }],
          forceIndexForStaged: false
        }
      ],
      readers: clipcodeRuntimeReaders
    })

    const files = parseClipboard(result.payload, CLIPCODE_DEFAULTS.headerFormat)
    expect(files.map((file) => [file.path, file.content.trimEnd()])).toEqual([
      ['gone.ts', DELETED_FILE_MARKER]
    ])
  })
})
