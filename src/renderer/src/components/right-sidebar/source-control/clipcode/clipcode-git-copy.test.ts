import { describe, expect, it, vi } from 'vitest'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import type { GitDiffResult } from '../../../../../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { DELETED_FILE_MARKER } from './clipcode-clipboard-format'
import {
  buildClipcodeGitCopy,
  type ClipcodeContentReaders,
  type ClipcodeCopyRepo
} from './clipcode-git-copy'

function ctx(worktreePath: string): RuntimeGitContext {
  return { target: { kind: 'local' }, worktreeId: worktreePath, worktreePath }
}

function textDiff(
  original: string,
  modified: string,
  missingSides?: ('original' | 'modified')[]
): GitDiffResult {
  return {
    ...(missingSides ? { missingSides } : {}),
    kind: 'text',
    originalContent: original,
    modifiedContent: modified,
    originalIsBinary: false,
    modifiedIsBinary: false
  }
}

function makeReaders(overrides: Partial<ClipcodeContentReaders> = {}): ClipcodeContentReaders {
  return {
    readDiff: vi.fn(async () => textDiff('HEAD', 'INDEX')),
    readWorkingFile: vi.fn(async (_c, path) => ({ content: `WORK ${path}`, isBinary: false })),
    ...overrides
  }
}

function repo(
  worktreePath: string,
  entries: GitStatusEntry[],
  forceIndexForStaged = false
): ClipcodeCopyRepo {
  return { context: ctx(worktreePath), entries, forceIndexForStaged }
}

const modified = (path: string, area: GitStatusEntry['area'] = 'unstaged'): GitStatusEntry => ({
  path,
  status: 'modified',
  area
})

function binaryDiff(side: 'original' | 'modified', otherText: string): GitDiffResult {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the literal has exactly one binary side, as the union requires.
  return {
    kind: 'binary',
    originalContent: side === 'original' ? '' : otherText,
    modifiedContent: side === 'modified' ? '' : otherText,
    originalIsBinary: side === 'original',
    modifiedIsBinary: side === 'modified'
  } as GitDiffResult
}

describe('buildClipcodeGitCopy binary sides', () => {
  it('copies staged text that replaced a binary HEAD blob', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.bin', 'staged')], true)],
      readers: makeReaders({ readDiff: vi.fn(async () => binaryDiff('original', 'now text')) })
    })
    expect(result.payload).toContain('now text')
  })

  it('copies an empty staged text blob over a binary HEAD instead of the working tree', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.bin', 'staged')], true)],
      readers: makeReaders({ readDiff: vi.fn(async () => binaryDiff('original', '')) })
    })
    expect(result.payload).toContain('x.bin')
    expect(result.payload).not.toContain('WORK')
  })

  it('excludes a staged file whose index side is binary', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.bin', 'staged')], true)],
      readers: makeReaders({ readDiff: vi.fn(async () => binaryDiff('modified', 'old text')) })
    })
    expect(result.payload).toBe('')
  })

  it('excludes a deleted binary instead of emitting the deletion marker', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [{ path: 'x.bin', status: 'deleted', area: 'unstaged' }])],
      readers: makeReaders({ readDiff: vi.fn(async () => binaryDiff('original', '')) })
    })
    expect(result.payload).toBe('')
  })
})

describe('buildClipcodeGitCopy', () => {
  it('uses folder-relative paths and a root line across repos', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.ts')]), repo('/f/g/b', [modified('y.ts')])],
      readers: makeReaders()
    })
    expect(result.payload.split('\n')[0]).toBe('// clipcode-root: f')
    expect(result.payload).toContain('// file: [MODIFIED] a/x.ts\nWORK x.ts')
    expect(result.payload).toContain('// file: [MODIFIED] g/b/y.ts\nWORK y.ts')
    expect(result.copiedFileCount).toBe(2)
  })

  it('emits one entry per path and prefers the working tree over the index', async () => {
    const readers = makeReaders()
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.ts', 'staged'), modified('x.ts', 'unstaged')], true)],
      readers
    })
    expect(result.copiedFileCount).toBe(1)
    expect(result.payload).toContain('WORK x.ts')
    expect(result.payload).not.toContain('INDEX')
  })

  it('reads the index for staged rows when forced, with git spacing', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.ts', 'staged')], true)],
      readers: makeReaders()
    })
    expect(result.payload).toBe('// clipcode-root: f\n// file: [MODIFIED] a/x.ts\nINDEX\n')
  })

  it('reports a staged row as unreadable instead of copying the working tree when the index read fails', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.ts', 'staged')], true)],
      readers: makeReaders({
        readDiff: vi.fn(async () => {
          throw new Error('boom')
        })
      })
    })
    expect(result.payload).toBe('')
    expect(result.unreadableFileCount).toBe(1)
  })

  it('copies an empty index blob instead of the working tree', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.ts', 'staged')], true)],
      readers: makeReaders({ readDiff: vi.fn(async () => textDiff('was text', '')) })
    })
    expect(result.payload).toBe('// clipcode-root: f\n// file: [MODIFIED] a/x.ts\n\n')
  })

  it('copies a new empty staged file when the host reports only the original side missing', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [{ path: 'e.ts', status: 'added', area: 'staged' }], true)],
      readers: makeReaders({ readDiff: vi.fn(async () => textDiff('', '', ['original'])) })
    })
    expect(result.unreadableFileCount).toBe(0)
    expect(result.payload).toContain('[NEW] a/e.ts')
  })

  it('treats an empty index side from a host without missingSides as unreadable', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.ts', 'staged')], true)],
      readers: makeReaders({ readDiff: vi.fn(async () => textDiff('', '')) })
    })
    expect(result.payload).toBe('')
    expect(result.unreadableFileCount).toBe(1)
  })

  it('copies an empty deleted file as empty, but a missing HEAD blob as the marker', async () => {
    const deleted: GitStatusEntry = { path: 'x.ts', status: 'deleted', area: 'unstaged' }
    const run = (diff: GitDiffResult) =>
      buildClipcodeGitCopy({
        rootPath: '/f',
        repos: [repo('/f/a', [deleted])],
        readers: makeReaders({ readDiff: vi.fn(async () => diff) })
      })
    expect((await run(textDiff('', ''))).payload).not.toContain('has been deleted')
    expect((await run(textDiff('', '', ['original']))).payload).toContain('has been deleted')
  })

  it.each<[string, GitDiffResult]>([
    [
      'render-limited HEAD+index',
      {
        kind: 'text',
        originalContent: '',
        modifiedContent: '',
        originalIsBinary: false,
        modifiedIsBinary: false,
        largeDiffRenderLimit: {
          limited: true,
          reason: 'character-count',
          lineCounts: null,
          characterCount: 7_000_000,
          limits: { maxLinesPerSide: 120_000, maxCombinedCharacters: 6_000_000 }
        }
      }
    ],
    ['failed (empty) blob read', textDiff('HEAD', '', ['modified'])]
  ])(
    'never copies the working tree for a staged row whose index read is %s',
    async (_name, diff) => {
      const result = await buildClipcodeGitCopy({
        rootPath: '/f',
        repos: [repo('/f/a', [modified('x.ts', 'staged')], true)],
        readers: makeReaders({ readDiff: vi.fn(async () => diff) })
      })
      expect(result.payload).not.toContain('WORK x.ts')
    }
  )

  it('writes a size skip line for a staged file over the diff render limit', async () => {
    const limited: GitDiffResult = {
      kind: 'text',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: false,
      modifiedIsBinary: false,
      largeDiffRenderLimit: {
        limited: true,
        reason: 'character-count',
        lineCounts: null,
        characterCount: 7_000_000,
        limits: { maxLinesPerSide: 120_000, maxCombinedCharacters: 6_000_000 }
      }
    }
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('big.txt', 'staged')], true)],
      readers: makeReaders({ readDiff: vi.fn(async () => limited) })
    })
    expect(result.payload).toContain(
      '// file: [MODIFIED] a/big.txt\n// File skipped: size exceeds limit (staged version too large to read)'
    )
    expect(result.skippedFileSizeCount).toBe(1)
  })

  it('asks for the full index text so a staged file past the render limit still copies', async () => {
    const indexText = 'i\n'.repeat(130_000)
    const readDiff = vi.fn(async (): Promise<GitDiffResult> => ({
      kind: 'text',
      originalContent: '',
      modifiedContent: indexText,
      originalIsBinary: false,
      modifiedIsBinary: false
    }))
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('big.txt', 'staged')], true)],
      readers: makeReaders({ readDiff })
    })
    expect(readDiff).toHaveBeenCalledWith(expect.anything(), {
      filePath: 'big.txt',
      staged: true,
      skipRenderLimit: true
    })
    expect(result.payload).toContain(`// file: [MODIFIED] a/big.txt\n${indexText}`)
    expect(result.skippedFileSizeCount).toBe(0)
  })

  it('keeps regular spacing (empty wrapper lines) when all rows are working-tree copies', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('x.ts')])],
      readers: makeReaders()
    })
    expect(result.payload).toBe('// clipcode-root: f\n\n// file: [MODIFIED] a/x.ts\nWORK x.ts\n\n')
  })

  it('copies HEAD content for deleted files and the marker when HEAD is unreadable', async () => {
    const deleted: GitStatusEntry[] = [
      { path: 'gone.ts', status: 'deleted', area: 'unstaged' },
      { path: 'lost.ts', status: 'deleted', area: 'staged' }
    ]
    const readDiff = vi.fn(async (_c: RuntimeGitContext, args: { filePath: string }) => {
      if (args.filePath === 'lost.ts') {
        throw new Error('no head')
      }
      return textDiff('OLD', '')
    })
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', deleted)],
      readers: makeReaders({ readDiff })
    })
    expect(readDiff).toHaveBeenCalledWith(expect.anything(), {
      filePath: 'gone.ts',
      staged: false,
      compareAgainstHead: true
    })
    expect(result.payload).toContain('// file: [DELETED] a/gone.ts\nOLD')
    expect(result.payload).toContain(`// file: [DELETED] a/lost.ts\n${DELETED_FILE_MARKER}`)
  })

  it('labels added, untracked and renamed rows', async () => {
    const entries: GitStatusEntry[] = [
      { path: 'n.ts', status: 'added', area: 'unstaged' },
      { path: 'u.ts', status: 'untracked', area: 'untracked' },
      { path: 'new.ts', oldPath: 'old.ts', status: 'renamed', area: 'unstaged' }
    ]
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', entries)],
      readers: makeReaders()
    })
    expect(result.payload).toContain('[NEW] a/n.ts')
    expect(result.payload).toContain('[NEW] a/u.ts')
    expect(result.payload).toContain('[MOVED] a/new.ts')
    expect(result.payload).not.toContain('old.ts')
  })

  it('skips binary, unreadable and gitlink rows without a header', async () => {
    const entries: GitStatusEntry[] = [
      modified('bin.png'),
      modified('bad.ts'),
      modified('sub'),
      modified('ok.ts')
    ]
    entries[2] = {
      ...entries[2],
      submodule: { commitChanged: true, trackedChanges: false, untrackedChanges: false }
    }
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', entries)],
      readers: makeReaders({
        readWorkingFile: vi.fn(async (_c, path) => {
          if (path === 'bad.ts') {
            throw new Error('EACCES')
          }
          return { content: path === 'bin.png' ? 'x' : 'ok', isBinary: path === 'bin.png' }
        })
      })
    })
    expect(result.copiedFileCount).toBe(1)
    expect(result.unreadableFileCount).toBe(1)
    expect(result.payload).toContain('a/ok.ts')
    expect(result.payload).not.toMatch(/bin\.png|bad\.ts|a\/sub/)
  })

  it('skips text a lenient decode turned into U+FFFD instead of copying mojibake', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('latin1.txt'), modified('ok.ts')])],
      readers: makeReaders({
        readWorkingFile: vi.fn(async (_c, path) => ({
          content: path === 'latin1.txt' ? 'caf\uFFFD' : 'ok',
          isBinary: false
        }))
      })
    })
    expect(result.copiedFileCount).toBe(1)
    expect(result.unreadableFileCount).toBe(1)
    expect(result.payload).not.toContain('latin1.txt')
  })

  it('writes a skip line for files over the size limit', async () => {
    const big = 'a'.repeat(900 * 1024)
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('big.ts')])],
      readers: makeReaders({
        readWorkingFile: vi.fn(async () => ({ content: big, isBinary: false }))
      })
    })
    expect(result.skippedFileSizeCount).toBe(1)
    expect(result.copiedFileCount).toBe(0)
    expect(result.entryCount).toBe(1)
    expect(result.payload).toContain(
      `// file: [MODIFIED] a/big.ts\n// File skipped: size exceeds limit (${big.length} bytes)`
    )
  })

  it('writes a size skip line when a remote read is too large', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [modified('lock.yaml')])],
      readers: makeReaders({
        readWorkingFile: vi.fn(async () => {
          throw new Error('Remote file is too large to open in the editor (600000 bytes)')
        })
      })
    })
    expect(result.skippedFileSizeCount).toBe(1)
    expect(result.unreadableFileCount).toBe(0)
    expect(result.payload).toContain('a/lock.yaml\n// File skipped: size exceeds limit')
  })

  it('does not cap the file count', async () => {
    const entries = Array.from({ length: 45 }, (_, i) => modified(`f${i}.ts`))
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', entries)],
      readers: makeReaders()
    })
    expect(result.copiedFileCount).toBe(45)
  })

  it('drops rows outside the copy root', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f/a',
      repos: [repo('/f', [modified('outside.ts'), modified('a/inside.ts')])],
      readers: makeReaders()
    })
    expect(result.copiedFileCount).toBe(1)
    expect(result.payload).toContain('// file: [MODIFIED] inside.ts')
  })

  it('returns an empty payload when nothing is copyable', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [repo('/f/a', [])],
      readers: makeReaders()
    })
    expect(result).toEqual({
      payload: '',
      copiedFileCount: 0,
      skippedFileSizeCount: 0,
      unreadableFileCount: 0,
      skippedBinaryFileCount: 0,
      entryCount: 0
    })
  })

  it('counts binary rows it leaves out, unless another area of the same path was copied', async () => {
    const result = await buildClipcodeGitCopy({
      rootPath: '/f',
      repos: [
        repo(
          '/f/a',
          [modified('logo.png'), modified('doc.pdf'), modified('doc.pdf', 'staged')],
          true
        )
      ],
      readers: makeReaders({
        readWorkingFile: vi.fn(async () => ({ content: '', isBinary: true })),
        readDiff: vi.fn(async (_c: RuntimeGitContext, args: { filePath: string }) =>
          args.filePath === 'doc.pdf' ? textDiff('', 'staged text') : textDiff('', '')
        )
      })
    })
    expect(result.skippedBinaryFileCount).toBe(1)
    expect(result.payload).toContain('a/doc.pdf')
    expect(result.payload).not.toContain('a/logo.png')
  })
})
