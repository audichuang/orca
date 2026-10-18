import { describe, expect, it, vi } from 'vitest'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import type {
  GitBranchChangeEntry,
  GitDiffResult,
  GitDiffTextResult
} from '../../../../../../shared/git-diff-compare-types'
import { CLIPCODE_DEFAULTS, DELETED_FILE_MARKER, parseClipboard } from './clipcode-clipboard-format'
import {
  buildClipcodeCommitCopy,
  type ClipcodeCommitCopyCommit,
  type ClipcodeCommitReaders
} from './clipcode-commit-copy'

const context: RuntimeGitContext = {
  target: { kind: 'local' },
  worktreeId: 'wt',
  worktreePath: '/work/folder/WebApp'
}

function text(
  original: string,
  modified: string,
  extra: Pick<GitDiffTextResult, 'missingSides' | 'largeDiffRenderLimit'> = {}
): GitDiffTextResult {
  return {
    kind: 'text',
    originalContent: original,
    modifiedContent: modified,
    originalIsBinary: false,
    modifiedIsBinary: false,
    ...extra
  }
}

function parsePayload(
  payload: string
): { path: string; changeType: string | undefined; content: string }[] {
  return parseClipboard(payload, CLIPCODE_DEFAULTS.headerFormat).map((entry) => ({
    path: entry.path,
    changeType: [...entry.changeTypes][0],
    content: entry.content.trimEnd()
  }))
}

const OID_A = 'a'.repeat(40)
const OID_B = 'b'.repeat(40)
const PARENT_1 = '1'.repeat(40)
const PARENT_2 = '2'.repeat(40)

function commit(
  commitOid: string,
  entries: GitBranchChangeEntry[],
  extra: Partial<ClipcodeCommitCopyCommit> = {}
): ClipcodeCommitCopyCommit {
  return { commitOid, parentOids: [PARENT_1], entries, ...extra }
}

function readers(
  diffs: Record<string, GitDiffResult | Error>
): ClipcodeCommitReaders & { readCommitDiff: ReturnType<typeof vi.fn> } {
  return {
    readCommitDiff: vi.fn(async (_context, args) => {
      const hit = diffs[`${args.commitOid}:${args.parentOid}:${args.filePath}`]
      if (!hit || hit instanceof Error) {
        throw hit ?? new Error('missing')
      }
      return hit
    })
  }
}

describe('buildClipcodeCommitCopy', () => {
  it('copies the post-commit content with git spacing and change labels', async () => {
    const r = readers({
      [`${OID_A}:${PARENT_1}:src/a.ts`]: text('old a', 'new a'),
      [`${OID_A}:${PARENT_1}:src/new.ts`]: text('', 'fresh', { missingSides: ['original'] }),
      [`${OID_A}:${PARENT_1}:src/moved.ts`]: text('moved before', 'moved after')
    })
    const result = await buildClipcodeCommitCopy({
      rootPath: '/work/folder',
      context,
      commits: [
        commit(OID_A, [
          { path: 'src/a.ts', status: 'modified' },
          { path: 'src/new.ts', status: 'added' },
          { path: 'src/moved.ts', oldPath: 'src/old.ts', status: 'renamed' }
        ])
      ],
      readers: r
    })

    const parsed = parsePayload(result.payload)
    expect(parsed.map((file) => [file.path, file.changeType, file.content])).toEqual([
      ['WebApp/src/a.ts', 'MODIFIED', 'new a'],
      ['WebApp/src/new.ts', 'NEW', 'fresh'],
      ['WebApp/src/moved.ts', 'MOVED', 'moved after']
    ])
    expect(result.payload.startsWith('// clipcode-root: folder\n')).toBe(true)
    expect(result.copiedFileCount).toBe(3)
    expect(r.readCommitDiff).toHaveBeenCalledWith(context, {
      commitOid: OID_A,
      parentOid: PARENT_1,
      filePath: 'src/moved.ts',
      oldPath: 'src/old.ts'
    })
  })

  it('takes a deleted file from the first parent that still has it', async () => {
    const r = readers({
      [`${OID_A}:${PARENT_1}:gone.ts`]: text('', '', { missingSides: ['original', 'modified'] }),
      [`${OID_A}:${PARENT_2}:gone.ts`]: text('before delete', '', { missingSides: ['modified'] })
    })
    const result = await buildClipcodeCommitCopy({
      rootPath: context.worktreePath,
      context,
      commits: [
        commit(OID_A, [{ path: 'gone.ts', status: 'deleted' }], {
          parentOids: [PARENT_1, PARENT_2]
        })
      ],
      readers: r
    })
    expect(parsePayload(result.payload)).toMatchObject([
      { path: 'gone.ts', changeType: 'DELETED', content: 'before delete' }
    ])
  })

  it('falls back to the deletion marker when no parent can be read', async () => {
    const result = await buildClipcodeCommitCopy({
      rootPath: context.worktreePath,
      context,
      commits: [commit(OID_A, [{ path: 'gone.ts', status: 'deleted' }])],
      readers: readers({})
    })
    expect(parsePayload(result.payload)).toMatchObject([
      { path: 'gone.ts', changeType: 'DELETED', content: DELETED_FILE_MARKER }
    ])
  })

  it('skips binaries, reports unreadable text and writes a size line for huge files', async () => {
    const r = readers({
      [`${OID_A}:${PARENT_1}:logo.png`]: {
        kind: 'binary',
        originalContent: '',
        modifiedContent: '',
        originalIsBinary: false,
        modifiedIsBinary: true
      },
      [`${OID_A}:${PARENT_1}:nul.dat`]: text('', 'a\0b'),
      [`${OID_A}:${PARENT_1}:latin1.txt`]: text('', 'caf�'),
      [`${OID_A}:${PARENT_1}:missing.ts`]: text('x', '', { missingSides: ['modified'] }),
      [`${OID_A}:${PARENT_1}:huge.json`]: text('', '', {
        largeDiffRenderLimit: {
          limited: true,
          reason: 'line-count',
          lineCounts: { original: 0, modified: 200_000 },
          characterCount: 1,
          limits: { maxLinesPerSide: 1, maxCombinedCharacters: 1 }
        }
      })
    })
    const result = await buildClipcodeCommitCopy({
      rootPath: context.worktreePath,
      context,
      commits: [
        commit(OID_A, [
          { path: 'logo.png', status: 'modified' },
          { path: 'nul.dat', status: 'added' },
          { path: 'latin1.txt', status: 'added' },
          { path: 'missing.ts', status: 'modified' },
          { path: 'huge.json', status: 'added' }
        ])
      ],
      readers: r
    })
    expect(result.skippedBinaryFileCount).toBe(2)
    expect(result.unreadableFileCount).toBe(2)
    expect(result.skippedFileSizeCount).toBe(1)
    expect(parsePayload(result.payload)).toMatchObject([
      {
        path: 'huge.json',
        changeType: 'NEW',
        content: expect.stringContaining('size exceeds limit')
      }
    ])
  })

  it('keeps the newest commit in graph order, even when rebase left it an older author date', async () => {
    const r = readers({
      [`${OID_A}:${PARENT_1}:shared.ts`]: text('', 'older'),
      [`${OID_A}:${PARENT_1}:only-a.ts`]: text('', 'a only'),
      [`${OID_B}:${PARENT_1}:shared.ts`]: text('', 'newer')
    })
    const result = await buildClipcodeCommitCopy({
      rootPath: context.worktreePath,
      context,
      // Graph order: B is the newer commit and comes first.
      commits: [
        commit(OID_B, [{ path: 'shared.ts', status: 'modified' }]),
        commit(OID_A, [
          { path: 'shared.ts', status: 'added' },
          { path: 'only-a.ts', status: 'added' }
        ])
      ],
      readers: r
    })
    expect(parsePayload(result.payload).map((file) => [file.path, file.content])).toEqual([
      ['shared.ts', 'newer'],
      ['only-a.ts', 'a only']
    ])
    expect(r.readCommitDiff).not.toHaveBeenCalledWith(
      context,
      expect.objectContaining({ commitOid: OID_A, filePath: 'shared.ts' })
    )
  })

  it('does not bring back a path a newer commit renamed away', async () => {
    const r = readers({
      [`${OID_B}:${PARENT_1}:new-name.ts`]: text('', 'moved'),
      [`${OID_A}:${PARENT_1}:old-name.ts`]: text('', 'before the move')
    })
    const result = await buildClipcodeCommitCopy({
      rootPath: context.worktreePath,
      context,
      commits: [
        commit(OID_B, [{ path: 'new-name.ts', oldPath: 'old-name.ts', status: 'renamed' }]),
        commit(OID_A, [{ path: 'old-name.ts', status: 'modified' }])
      ],
      readers: r
    })
    expect(parsePayload(result.payload).map((file) => [file.path, file.changeType])).toEqual([
      ['new-name.ts', 'MOVED']
    ])
  })
})
