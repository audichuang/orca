import { describe, expect, it } from 'vitest'
import { parseClipboard, type ParsedEntry } from './clipcode-clipboard-format'
import {
  planClipcodeRestore,
  previewClipcodeRestore,
  sanitizeRelativePath,
  suggestRestoreBase,
  type ClipcodeTargetState
} from './clipcode-restore-plan'

const entry = (path: string, labels: ParsedEntry['changeTypes'] = new Set(), content = 'c') => ({
  path,
  content,
  changeTypes: labels
})

describe('sanitizeRelativePath', () => {
  it.each([
    '../x',
    'a/../../x',
    'C:/x',
    'a/C:/x',
    'a/b?.ts',
    '.git/hooks/pre-commit',
    'a/.GIT/config',
    '.git./config',
    '.git /config',
    'a/.Git../hooks/x',
    'GIT~1/config',
    'a/git~2/config',
    ''
  ])('rejects %s', (value) => {
    expect(sanitizeRelativePath(value)).toBeUndefined()
  })

  it('normalizes separators and dot segments', () => {
    expect(sanitizeRelativePath('a\\b//./c.ts')).toBe('a/b/c.ts')
  })
})

describe('planClipcodeRestore', () => {
  it('never writes a copy-time skip placeholder as file content', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [
        entry('big.ts', new Set(), '// File skipped: size exceeds limit (600000 bytes)\n'),
        entry('real.ts', new Set(), '// File skipped is a comment I wrote\n')
      ]
    })
    expect(plan.writes.map((w) => w.relativePath)).toEqual(['real.ts'])
    expect(plan.skipped).toEqual([{ rawPath: 'big.ts', reason: 'CONTENT_SKIPPED' }])
  })

  it('skips any entry whose first line is an unreadable/read-error placeholder, like ClipCode 1.2.15', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [
        entry('a.ts', new Set(['MODIFIED']), '// Unable to read file content\n'),
        entry('b.ts', new Set(), '  // Error reading file content  \n'),
        entry('d.txt', new Set(['NEW']), '// Unable to read file content\nsecond line'),
        entry('e.txt', new Set(), '// File skipped: size exceeds limit (1 bytes)\nsecond line'),
        entry('f.ts', new Set(), '// Error reading file content: EACCES'),
        entry('g.ts', new Set(), '// This file has been deleted in this change')
      ]
    })
    expect(plan.writes.map((w) => w.relativePath)).toEqual(['f.ts', 'g.ts'])
    expect(plan.skipped.map((s) => [s.rawPath, s.reason])).toEqual([
      ['a.ts', 'CONTENT_SKIPPED'],
      ['b.ts', 'CONTENT_SKIPPED'],
      ['d.txt', 'CONTENT_SKIPPED'],
      ['e.txt', 'CONTENT_SKIPPED']
    ])
  })

  it('protects .git variants as .git, not as a generic unsafe path', () => {
    const plan = planClipcodeRestore({ rootPath: '/f', entries: [entry('a/GIT~1/config')] })
    expect(plan.skipped).toEqual([{ rawPath: 'a/GIT~1/config', reason: 'PROTECTED_GIT' }])
  })

  it('skips every spelling of a path that differs only by letter case', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [
        entry('A.txt', new Set(), 'upper'),
        entry('a.txt', new Set(), 'lower'),
        entry('A.txt', new Set(), 'again'),
        entry('b.txt', new Set(), 'kept')
      ]
    })
    expect(plan.writes).toEqual([{ relativePath: 'b.txt', content: 'kept' }])
    expect(plan.skipped).toEqual([
      { rawPath: 'a.txt', reason: 'CASE_CONFLICT' },
      { rawPath: 'A.txt', reason: 'CASE_CONFLICT' }
    ])
  })

  it('never keeps a delete whose case-only replacement was skipped', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [entry('A.txt', new Set(['DELETED'])), entry('a.txt', new Set(), 'new')]
    })
    expect(plan.deletes).toEqual([])
    expect(plan.writes).toEqual([])
  })

  it('rejects traversal, and absolute paths outside the root', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [entry('../x'), entry('/etc/passwd'), entry('ok.ts')]
    })
    expect(plan.skipped).toEqual([
      { rawPath: '../x', reason: 'UNSAFE_PATH' },
      { rawPath: '/etc/passwd', reason: 'OUTSIDE_ROOT' }
    ])
    expect(plan.writes.map((w) => w.relativePath)).toEqual(['ok.ts'])
  })

  it('reports .git targets as protected', () => {
    const plan = planClipcodeRestore({ rootPath: '/f', entries: [entry('a/.git/hooks/x')] })
    expect(plan.skipped).toEqual([{ rawPath: 'a/.git/hooks/x', reason: 'PROTECTED_GIT' }])
  })

  it('accepts absolute paths inside the root', () => {
    const plan = planClipcodeRestore({ rootPath: '/f', entries: [entry('/f/a/x.ts')] })
    expect(plan.writes[0].relativePath).toBe('a/x.ts')
  })

  it('aligns absolute paths from another machine on the root folder name', () => {
    const plan = planClipcodeRestore({
      rootPath: '/home/me/f',
      entries: [entry('C:\\Users\\you\\f\\a\\x.ts')]
    })
    expect(plan.writes[0].relativePath).toBe('a/x.ts')
  })

  it('refuses an ambiguous cross-machine suffix', () => {
    const plan = planClipcodeRestore({ rootPath: '/p/f', entries: [entry('/x/f/a/f/b.ts')] })
    expect(plan.skipped).toEqual([{ rawPath: '/x/f/a/f/b.ts', reason: 'OUTSIDE_ROOT' }])
  })

  it('routes DELETED to deletes and MOVED to a write of the new path only', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [entry('gone.ts', new Set(['DELETED'])), entry('new.ts', new Set(['MOVED']))]
    })
    expect(plan.deletes).toEqual([{ relativePath: 'gone.ts' }])
    expect(plan.writes).toEqual([{ relativePath: 'new.ts', content: 'c' }])
  })

  it('keeps one write per resolved path, the last entry winning', () => {
    const plan = planClipcodeRestore({
      rootPath: '/p/proj',
      entries: [entry('proj/a.ts', new Set(), 'one'), entry('a.ts', new Set(), 'two')],
      base: { kind: 'strip', segment: 'proj' }
    })
    expect(plan.writes).toEqual([{ relativePath: 'a.ts', content: 'two' }])
  })

  it('applies strip and add bases and still sanitizes the result', () => {
    expect(
      planClipcodeRestore({
        rootPath: '/f/a',
        entries: [entry('a/x.ts')],
        base: { kind: 'strip', segment: 'a' }
      }).writes[0].relativePath
    ).toBe('x.ts')
    expect(
      planClipcodeRestore({
        rootPath: '/f',
        entries: [entry('x.ts')],
        base: { kind: 'add', prefix: 'a' }
      }).writes[0].relativePath
    ).toBe('a/x.ts')
  })
})

describe('suggestRestoreBase', () => {
  const base = { rootPath: '/f/a', sourceRootIsDirectory: false }

  it('suggests nothing when the target has the source root name', () => {
    expect(
      suggestRestoreBase({ ...base, relativePaths: ['x.ts'], sourceRoot: 'a' })
    ).toBeUndefined()
  })

  it('suggests stripping when every nested path starts with the target folder name', () => {
    expect(
      suggestRestoreBase({ ...base, relativePaths: ['a/x.ts', 'a/y/z.ts'], sourceRoot: 'f' })?.base
    ).toEqual({ kind: 'strip', segment: 'a' })
  })

  it('suggests adding the source root when it exists as a directory', () => {
    expect(
      suggestRestoreBase({
        rootPath: '/f',
        relativePaths: ['x.ts'],
        sourceRoot: 'a',
        sourceRootIsDirectory: true
      })?.base
    ).toEqual({ kind: 'add', prefix: 'a' })
  })

  it('never guesses without the root line', () => {
    expect(
      suggestRestoreBase({ ...base, relativePaths: ['a/x.ts', 'a/y.ts'], sourceRoot: undefined })
    ).toBeUndefined()
  })
})

describe('previewClipcodeRestore', () => {
  it('deletes only existing files and skips directories', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [
        entry('new.ts'),
        entry('old.ts'),
        entry('dir'),
        entry('gone.ts', new Set(['DELETED'])),
        entry('absent.ts', new Set(['DELETED']))
      ]
    })
    const states: Record<string, ClipcodeTargetState> = {
      'old.ts': 'file',
      dir: 'directory',
      'gone.ts': 'file'
    }
    const preview = previewClipcodeRestore(plan, (path) => states[path] ?? 'missing')
    expect(preview.create.map((w) => w.relativePath)).toEqual(['new.ts'])
    expect(preview.overwrite.map((w) => w.relativePath)).toEqual(['old.ts'])
    expect(preview.delete).toEqual([{ relativePath: 'gone.ts' }])
    expect(preview.skipped).toEqual([
      { path: 'dir', reason: 'IS_DIRECTORY' },
      { path: 'absent.ts', reason: 'ALREADY_ABSENT' }
    ])
  })

  it('skips targets under a file parent or that could not be checked', () => {
    const plan = planClipcodeRestore({
      rootPath: '/f',
      entries: [
        entry('README.md/child.ts'),
        entry('locked.ts'),
        entry('ok.txt'),
        entry('x.ts', new Set(['DELETED']))
      ]
    })
    const states: Record<string, ClipcodeTargetState> = {
      'README.md/child.ts': 'parentIsFile',
      'locked.ts': 'unreadable',
      'x.ts': 'parentIsFile'
    }
    const preview = previewClipcodeRestore(plan, (path) => states[path] ?? 'missing')
    expect(preview.create.map((w) => w.relativePath)).toEqual(['ok.txt'])
    expect(preview.skipped).toEqual([
      { path: 'README.md/child.ts', reason: 'PARENT_IS_FILE' },
      { path: 'locked.ts', reason: 'TARGET_UNREADABLE' },
      { path: 'x.ts', reason: 'PARENT_IS_FILE' }
    ])
  })

  it('round-trips a parsed clipboard with the default header', () => {
    const entries = parseClipboard('// file: [NEW] a/x.ts\nhello\n', '// file: $FILE_PATH')
    const plan = planClipcodeRestore({ rootPath: '/f', entries })
    expect(plan.writes).toEqual([{ relativePath: 'a/x.ts', content: 'hello' }])
  })
})
