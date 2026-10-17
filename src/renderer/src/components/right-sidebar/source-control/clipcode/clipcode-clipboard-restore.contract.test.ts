import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile
} from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import { parseClipboard, type ChangeTypeLabel, type ParsedEntry } from './clipcode-clipboard-format'
import {
  planClipcodeRestore,
  previewClipcodeRestore,
  type ClipcodeTargetState
} from './clipcode-restore-plan'
import { readCandidateState } from './clipcode-restore-target-state'

// Runs the plugins' frozen pathCases / restoreCases through the real planner and target-state
// reader on a real temp tree. Orca restores into ONE root (the plugins' primary root `project`).

vi.mock('@/runtime/runtime-file-mutation-client', () => ({
  readRuntimeDirectory: async (_context: unknown, dirPath: string) =>
    (await readdir(dirPath, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isSymlink: entry.isSymbolicLink()
    }))
}))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({
  statRuntimePath: async (_context: unknown, filePath: string) => ({
    isDirectory: (await stat(filePath)).isDirectory(),
    size: 0,
    mtime: 0
  }),
  isMissingRuntimePathError: (error: unknown) => String(error).includes('ENOENT')
}))
// Mirrors the host read: lenient UTF-8 decode, NUL means binary.
vi.mock('@/runtime/runtime-file-read-client', () => ({
  readRuntimeFileContent: async ({ filePath }: { filePath: string }) => {
    const bytes = await readFile(filePath)
    return { content: bytes.toString('utf8'), isBinary: bytes.includes(0) }
  }
}))

type FileSpec = string | { text?: string; base64?: string }
type Layout = {
  dirs: string[]
  files: Record<string, FileSpec>
  symlinks: Record<string, string>
}
type PathOutcome = { root: string; path: string } | 'refused' | 'missing' | 'ambiguous'
type PathCase = { input: string; write: PathOutcome; delete: PathOutcome }
type RestoreCase = {
  name: string
  headerFormat: string
  payload: string
  creates: { root: string; path: string; content: string; existed: boolean }[]
  deletes: { root: string; path: string }[]
  skips: { rawPath: string; reason: string }[]
}
type Fixtures = {
  pathLayout: Layout
  pathCases: PathCase[]
  restoreLayout: Layout
  restoreCases: RestoreCase[]
}

const fixtures: Fixtures = JSON.parse(
  readFileSync(path.join(__dirname, '__fixtures__', 'clipcode-clipboard-contract.json'), 'utf8')
)

// Why: Orca refuses an absolute path that is not under its one root and has no unique root-name
// suffix; the plugins keep it literally under the primary root, or route it to a second root.
const ABSOLUTE_OUTSIDE_ROOT = new Set<string>([
  'D:\\Users\\author\\.m2\\repository\\library.jar!\\com\\example\\Library$Inner.java',
  '/foreign/checkout/src/New.kt',
  '\\\\server\\share\\arbitrary\\New.txt',
  '/etc/passwd',
  '/backup/backup/new.txt',
  '/unmapped/source.txt',
  'D:/a\u0085b.txt',
  'D:/a\u2028b.txt',
  'D:/a\u2029b.txt',
  'D:\\a\u2028b.txt',
  'D:\\a\u0085b.txt',
  '/a\u0085b.txt',
  '/a\u2028b.txt',
  'd:/lower/x.txt',
  'D://double//slash.txt',
  '//double/leading.txt',
  '/Users/bob/other/src/a.ts',
  'C:/Users/bob/other/src/a.ts',
  '/elsewhere/backup/y.ts',
  '/x/./y.txt',
  '/dir/',
  '  /spaced/path.txt  ',
  '\t/tabbed.txt',
  '/a\u3000b.txt',
  '/D/keep.txt',
  'D:/keep.txt',
  '/\ud83d\ude00/emoji.txt',
  'D:/\u00dcn\u00efcode/\u0444\u0430\u0439\u043b.txt',
  '/foo\\bar.txt',
  '@SIBLING@/z.txt',
  '@ROOT@',
  '/backup/lead.ts'
])
// Why: the plugins route a leading sibling-root name to that root; Orca has no second root.
const SIBLING_ROOT_LABEL = new Set<string>(['backup/rel.txt'])
const RESTORE_DIVERGENCES: Record<string, string> = {
  'an absolute path matching no root is kept literally under the primary root':
    'Orca skips absolute paths outside its root',
  'a sibling root label targets that root': 'Orca has a single root',
  'the same path twice is planned twice, in order':
    'Orca plans the last entry only; the written result is the same'
}
const REASON_ALIASES: Record<string, string> = {
  CONTENT_SKIPPED: 'PLACEHOLDER_BODY',
  SYMLINK_IN_PATH: 'UNRESOLVED_PATH',
  UNSAFE_PATH: 'UNRESOLVED_PATH',
  PROTECTED_GIT: 'UNRESOLVED_PATH'
}

const context: RuntimeFileOperationArgs = { target: { kind: 'local' }, worktreeId: null, worktreePath: null }

async function createLayout(layout: Layout): Promise<string> {
  const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'clipcode-contract-')))
  for (const dir of layout.dirs) {
    await mkdir(path.join(parent, dir), { recursive: true })
  }
  for (const [file, spec] of Object.entries(layout.files)) {
    const bytes =
      typeof spec === 'string'
        ? spec
        : spec.base64 !== undefined
          ? Buffer.from(spec.base64, 'base64')
          : (spec.text ?? '')
    await writeFile(path.join(parent, file), bytes)
  }
  for (const [link, target] of Object.entries(layout.symlinks)) {
    await symlink(path.join(parent, target), path.join(parent, link), 'dir')
  }
  return parent
}

async function preview(root: string, entries: readonly ParsedEntry[]) {
  const plan = planClipcodeRestore({ rootPath: root, entries })
  const states = new Map<string, ClipcodeTargetState>()
  for (const item of [...plan.writes, ...plan.deletes]) {
    states.set(
      item.relativePath,
      await readCandidateState(context, root, item.relativePath, new Map())
    )
  }
  return previewClipcodeRestore(plan, (relativePath) => states.get(relativePath) ?? 'missing')
}

function entry(input: string, labels: ChangeTypeLabel[] = []): ParsedEntry {
  return { path: input, content: 'x', changeTypes: new Set(labels) }
}

describe('clipcode cross-tool path contract', () => {
  let parent = ''
  let root = ''
  beforeAll(async () => {
    parent = await createLayout(fixtures.pathLayout)
    root = path.join(parent, 'project')
  })
  afterAll(() => rm(parent, { recursive: true, force: true }))

  it.each(fixtures.pathCases)('path $input', async (c) => {
    const input = c.input
      .replaceAll('@ROOT@', root)
      .replaceAll('@SIBLING@', path.join(parent, 'backup'))
    const write = await preview(root, [entry(input)])
    const del = await preview(root, [entry(input, ['DELETED'])])
    const written = write.create[0] ?? write.overwrite[0]
    const actual = {
      write: written ? { root: 'project', path: written.relativePath } : 'refused',
      delete: del.delete[0]
        ? { root: 'project', path: del.delete[0].relativePath }
        : del.skipped[0]?.reason === 'ALREADY_ABSENT'
          ? 'missing'
          : 'refused'
    }
    if (ABSOLUTE_OUTSIDE_ROOT.has(c.input)) {
      expect(actual).toEqual({ write: 'refused', delete: 'refused' })
    } else if (SIBLING_ROOT_LABEL.has(c.input)) {
      expect(actual).toEqual({ write: { root: 'project', path: c.input }, delete: 'missing' })
    } else {
      expect(actual).toEqual({ write: c.write, delete: c.delete })
    }
  })

  it('keeps every listed divergence in the fixture', () => {
    const inputs = new Set(fixtures.pathCases.map((c) => c.input))
    expect(
      [...ABSOLUTE_OUTSIDE_ROOT, ...SIBLING_ROOT_LABEL].filter((input) => !inputs.has(input))
    ).toEqual([])
  })
})

describe('clipcode cross-tool restore contract', () => {
  it.each(fixtures.restoreCases.filter((c) => !(c.name in RESTORE_DIVERGENCES)))(
    'restore: $name',
    async (c) => {
      const parent = await createLayout(fixtures.restoreLayout)
      try {
        const result = await preview(
          path.join(parent, 'project'),
          parseClipboard(c.payload, c.headerFormat)
        )
        const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path)
        expect({
          creates: [
            ...result.create.map((op) => ({
              path: op.relativePath,
              content: op.content,
              existed: false
            })),
            ...result.overwrite.map((op) => ({
              path: op.relativePath,
              content: op.content,
              existed: true
            }))
          ].sort(byPath),
          deletes: result.delete.map((op) => ({ path: op.relativePath })),
          skips: result.skipped.map((op) => ({
            rawPath: op.path,
            reason: REASON_ALIASES[op.reason] ?? op.reason
          }))
        }).toEqual({
          creates: c.creates
            .map((op) => ({ path: op.path, content: op.content, existed: op.existed }))
            .sort(byPath),
          deletes: c.deletes.map((op) => ({ path: op.path })),
          skips: c.skips.map((op) => ({ rawPath: op.rawPath, reason: op.reason }))
        })
      } finally {
        await rm(parent, { recursive: true, force: true })
      }
    }
  )

  it('keeps every listed divergence in the fixture', () => {
    const names = new Set(fixtures.restoreCases.map((c) => c.name))
    expect(Object.keys(RESTORE_DIVERGENCES).filter((name) => !names.has(name))).toEqual([])
  })
})
