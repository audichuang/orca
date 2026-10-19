import { describe, expect, it, vi } from 'vitest'
import type { DirEntry } from '../../../../../../shared/filesystem-entry-types'
import { buildPayload, CLIPCODE_DEFAULTS, parseClipboard } from './clipcode-clipboard-format'
import { buildClipcodeExplorerCopy, type ClipcodeExplorerReaders } from './clipcode-explorer-copy'

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
  '/ws/src/huge.log': new Error('File too large: 60.0MB exceeds 50MB limit'),
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
      entryCount: 7
    })
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
    expect(result).toMatchObject({ payload: '', entryCount: 0, unreadableFileCount: 1 })
  })
})
