import { describe, expect, it, vi } from 'vitest'
import type { DirEntry } from '../../../../../../shared/file-listing/directory-entry'
import { buildPayload, CLIPCODE_DEFAULTS, parseClipboard } from './clipcode-clipboard-format'
import type { ClipcodeFileRead } from './clipcode-entry-content'
import { buildClipcodeExplorerCopy, type ClipcodeExplorerReaders } from './clipcode-explorer-copy'
import { planClipcodeRestore } from './clipcode-restore-plan'

const dir = (name: string, isSymlink = false): DirEntry => ({ name, isDirectory: true, isSymlink })
const file = (name: string): DirEntry => ({ name, isDirectory: false, isSymlink: false })

const DIRS: Record<string, DirEntry[]> = {
  '/ws/src': [
    file('b.ts'),
    file('a.ts'),
    file('empty.txt'),
    file('img.png'),
    file('big.txt'),
    file('huge.log'),
    file('locked.txt'),
    // A symlinked folder while folder-following is off: listed as a file, read fails as "not a file".
    { name: 'linked-dir', isDirectory: false, isSymlink: true },
    dir('sub'),
    dir('.git'),
    dir('node_modules'),
    dir('loop', true)
  ],
  '/ws/src/sub': [file('c.ts')]
}
const FILES: Record<string, string | { binary: true } | Error> = {
  '/ws/src/a.ts': 'export const a = 1',
  '/ws/src/b.ts': 'export const b = 2',
  '/ws/src/sub/c.ts': '// file: fake header inside content',
  '/ws/src/empty.txt': '',
  '/ws/src/img.png': { binary: true },
  '/ws/src/big.txt': 'x'.repeat(CLIPCODE_DEFAULTS.maxFileSizeKB * 1024 + 1),
  // As the renderer sees a main-process rejection.
  '/ws/src/huge.log': new Error(
    "Error invoking remote method 'fs:readFile': Error: File too large: 60.0MB exceeds 50MB limit"
  ),
  '/ws/src/linked-dir': new Error(
    "Error invoking remote method 'fs:readFile': Error: Not a regular file"
  ),
  '/ws/src/locked.txt': new Error('EACCES: permission denied'),
  '/ws/README.md': '# Readme'
}

function makeReaders(): ClipcodeExplorerReaders {
  return {
    readDir: vi.fn(async (path: string) => {
      const entries = DIRS[path]
      if (!entries) {
        throw new Error(`unexpected readDir ${path}`)
      }
      return [...entries]
    }),
    readFile: vi.fn(async (path: string) => {
      const value = FILES[path]
      if (value === undefined) {
        throw new Error(`unexpected readFile ${path}`)
      }
      if (value instanceof Error) {
        throw value
      }
      return typeof value === 'string'
        ? { content: value, isBinary: false }
        : { content: '', isBinary: true }
    })
  }
}

describe('buildClipcodeExplorerCopy', () => {
  it('walks folders in explorer order and builds the Snipcode payload relative to the workspace', async () => {
    const readers = makeReaders()
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: [
        { path: '/ws/src', isDirectory: true },
        // Already inside the selected folder: copied once.
        { path: '/ws/src/a.ts', isDirectory: false },
        { path: '/ws/README.md', isDirectory: false }
      ],
      readers
    })

    expect(result.payload).toBe(
      buildPayload({
        ...CLIPCODE_DEFAULTS,
        sourceRoot: 'ws',
        files: [
          { path: 'src/sub/c.ts', content: '// file: fake header inside content' },
          { path: 'src/a.ts', content: 'export const a = 1' },
          { path: 'src/b.ts', content: 'export const b = 2' },
          {
            path: 'src/big.txt',
            skippedReason: `size exceeds limit (${CLIPCODE_DEFAULTS.maxFileSizeKB * 1024 + 1} bytes)`
          },
          { path: 'src/empty.txt', content: '' },
          { path: 'src/huge.log', skippedReason: 'size exceeds limit' },
          { path: 'README.md', content: '# Readme' }
        ]
      })
    )
    expect(result).toMatchObject({
      copiedFileCount: 5,
      skippedFileSizeCount: 2,
      skippedBinaryFileCount: 1,
      unreadableFileCount: 1,
      unreadablePaths: ['src/locked.txt'],
      symlinkedFolderPaths: ['src/loop', 'src/linked-dir'],
      entryCount: 7
    })
    // Only the host's binary flag (an old host): no bytes, so nothing to ask about.
    expect(result.nonText).toBeUndefined()
    // Hidden folders and symlinked folders are never entered.
    expect(vi.mocked(readers.readDir).mock.calls.map(([path]) => path)).toEqual([
      '/ws/src',
      '/ws/src/sub'
    ])
    // The escaped header-shaped line restores as content, not as a phantom file.
    expect(parseClipboard(result.payload, CLIPCODE_DEFAULTS.headerFormat)[0]).toMatchObject({
      path: 'src/sub/c.ts',
      content: '// file: fake header inside content'
    })
  })

  it('returns an empty payload and counts the failure when a folder cannot be read', async () => {
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: [{ path: '/ws/missing', isDirectory: true }],
      readers: makeReaders()
    })
    expect(result).toMatchObject({
      payload: '',
      entryCount: 0,
      unreadableFileCount: 1,
      unreadablePaths: ['missing']
    })
  })

  it('skips names that would restore as a different instruction, without reading them', async () => {
    const injected = ['[DELETED] victim.ts', 'evil\n# file: [DELETED] victim.ts', 'padded.ts ']
    const readFile = vi.fn(async (_path: string) => ({ content: 'payload', isBinary: false }))
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: [
        ...injected.map((name) => ({ path: `/ws/${name}`, isDirectory: false })),
        { path: '/ws/ok.ts', isDirectory: false }
      ],
      readers: { readDir: vi.fn(async () => []), readFile }
    })

    expect(result).toMatchObject({
      skippedUnsafePathCount: 3,
      unsafePaths: injected,
      copiedFileCount: 1
    })
    expect(readFile.mock.calls.map(([path]) => path)).toEqual(['/ws/ok.ts'])
    // The real restore path: nothing but ok.ts would be written, nothing deleted.
    const plan = planClipcodeRestore({
      rootPath: '/ws',
      entries: parseClipboard(result.payload, CLIPCODE_DEFAULTS.headerFormat)
    })
    expect(plan.deletes).toEqual([])
    expect(plan.writes.map((write) => write.relativePath)).toEqual(['ok.ts'])
  })

  it('carries non-text files only under Include; Exclude stays the text-only payload', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])
    const big5 = new Uint8Array([0xa4, 0xa4, 0xa4, 0xe5])
    const reads: Record<string, ClipcodeFileRead> = {
      '/ws/a.ts': { bytes: new TextEncoder().encode('export const a = 1') },
      '/ws/img/logo.png': { bytes: png },
      '/ws/notes-big5.txt': { bytes: big5 },
      '/ws/video.bin': { tooLargeSize: 5_000_000 }
    }
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: Object.keys(reads).map((path) => ({ path, isDirectory: false })),
      readers: { readDir: vi.fn(async () => []), readFile: vi.fn(async (path) => reads[path]) }
    })

    // Exclude: today's payload, non-text files dropped like binaries.
    expect(result.payload).toBe(
      '// clipcode-root: ws\n\n// file: a.ts\nexport const a = 1\n\n' +
        '// file: video.bin\n// File skipped: size exceeds limit (5000000 bytes)\n\n'
    )
    expect(result).toMatchObject({
      copiedFileCount: 1,
      skippedFileSizeCount: 1,
      skippedBinaryFileCount: 2,
      entryCount: 2
    })

    const include = result.nonText?.include
    expect(include).toMatchObject({
      copiedFileCount: 3,
      nonTextFileCount: 2,
      skippedFileSizeCount: 1,
      skippedBinaryFileCount: 0,
      entryCount: 4
    })
    expect(result.nonText?.summary).toMatchObject({
      count: 2,
      totalBytes: 10,
      files: [
        { path: 'img/logo.png', size: 6 },
        { path: 'notes-big5.txt', size: 4 }
      ],
      unreadOverLimitCount: 1
    })
    const plan = planClipcodeRestore({
      rootPath: '/ws',
      entries: parseClipboard(include?.payload ?? '', CLIPCODE_DEFAULTS.headerFormat)
    })
    const written = new Map(
      plan.writes.map((write) => [
        write.relativePath,
        'bytes' in write ? [...write.bytes] : write.content
      ])
    )
    expect(written.get('img/logo.png')).toEqual([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])
    expect(written.get('notes-big5.txt')).toEqual([0xa4, 0xa4, 0xa4, 0xe5])
    expect(written.get('a.ts')).toBe('export const a = 1')
  })

  it('does not build the Include payload when its Base64 alone is over 50 MiB', async () => {
    // One 2 MiB buffer shared by 19 files: Base64 plus line breaks is 2,832,997 bytes each.
    const image = new Uint8Array(2 * 1024 * 1024)
    const reads: Record<string, ClipcodeFileRead> = {
      '/ws/a.ts': { bytes: new TextEncoder().encode('export const a = 1') }
    }
    for (let index = 0; index < 19; index++) {
      reads[`/ws/img/${index}.png`] = { bytes: image }
    }
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: Object.keys(reads).map((path) => ({ path, isDirectory: false })),
      readers: { readDir: vi.fn(async () => []), readFile: vi.fn(async (path) => reads[path]) }
    })

    expect(result.payload).toBe('// clipcode-root: ws\n\n// file: a.ts\nexport const a = 1\n\n')
    expect(result.nonText?.include.payload).toBe('')
    expect(result.nonText?.summary).toMatchObject({
      count: 19,
      totalBytes: 39_845_888,
      includePayloadBytes: 53_826_943
    })
  })

  it('skips names another platform cannot restore and names them as they are, without reading them', async () => {
    const names = ['a:b.png', 'tab\tname.ts', 'back\\slash.ts', 'what?.ts', 'lone\uD800.ts']
    const readFile = vi.fn(async (_path: string) => ({ bytes: new TextEncoder().encode('x') }))
    const readDir = vi.fn(async (path: string) =>
      path === '/ws/trail ' ? [file('ok.ts')] : [file('in.ts')]
    )
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: [
        ...names.map((name) => ({ path: `/ws/${name}`, isDirectory: false })),
        // A trailing space on a folder inside the path is portable; on the file name it is not.
        { path: '/ws/trail ', isDirectory: true },
        { path: '/ws/bad|dir', isDirectory: true },
        { path: '/ws/ok.ts', isDirectory: false }
      ],
      readers: { readDir, readFile }
    })

    expect(result).toMatchObject({
      unsafePaths: [...names, 'bad|dir/in.ts'],
      skippedUnsafePathCount: 6,
      copiedFileCount: 2
    })
    expect(readFile.mock.calls.map(([path]) => path)).toEqual(['/ws/trail /ok.ts', '/ws/ok.ts'])
    expect(result.payload).toBe(
      '// clipcode-root: ws\n\n// file: trail /ok.ts\nx\n\n// file: ok.ts\nx\n\n'
    )

    // A Windows root still uses `\` as its separator.
    const windows = await buildClipcodeExplorerCopy({
      rootPath: 'C:\\ws',
      targets: [{ path: 'C:\\ws\\sub\\a.ts', isDirectory: false }],
      readers: { readDir, readFile }
    })
    expect(windows).toMatchObject({ skippedUnsafePathCount: 0, copiedFileCount: 1 })
    expect(windows.payload).toBe('// clipcode-root: ws\n\n// file: sub/a.ts\nx\n\n')
  })

  it('names a symlink pointing outside the allowed folders as unreadable, without following it', async () => {
    const denied = new Error(
      "Error invoking remote method 'fs:stat': Error: Access denied: path resolves outside allowed directories. If this blocks a legitimate workflow, please file a GitHub issue."
    )
    const readDir = vi.fn(async () => [
      { name: 'inside-link.png', isDirectory: false, isSymlink: true },
      { name: 'outside-link', isDirectory: false, isSymlink: true },
      file('denied.txt'),
      file('ok.ts')
    ])
    const readFile = vi.fn(async (path: string) => {
      if (path === '/ws/src/ok.ts') {
        return { bytes: new TextEncoder().encode('x') }
      }
      // The host follows a link whose target is inside the allowed folders.
      if (path === '/ws/src/inside-link.png') {
        return { bytes: new Uint8Array([0x89, 0x50, 0x00, 0x01]) }
      }
      throw denied
    })
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: [{ path: '/ws/src', isDirectory: true }],
      readers: { readDir, readFile }
    })
    expect(result).toMatchObject({
      copiedFileCount: 1,
      symlinkedFolderPaths: [],
      unreadablePaths: ['src/denied.txt', 'src/outside-link']
    })
    expect(result.nonText?.summary.files).toEqual([{ path: 'src/inside-link.png', size: 4 }])
  })

  it('names a directly selected symlinked folder instead of following it', async () => {
    const readDir = vi.fn(async () => [file('inner.ts')])
    const readFile = vi.fn(async () => ({ bytes: new TextEncoder().encode('x') }))
    const result = await buildClipcodeExplorerCopy({
      rootPath: '/ws',
      targets: [
        { path: '/ws/linked', isDirectory: true, isSymlink: true },
        { path: '/ws/ok.ts', isDirectory: false }
      ],
      readers: { readDir, readFile }
    })
    expect(readDir).not.toHaveBeenCalled()
    expect(result).toMatchObject({ copiedFileCount: 1, symlinkedFolderPaths: ['linked'] })
  })
})
