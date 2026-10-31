import { describe, expect, it } from 'vitest'
import {
  classifyHunk,
  isCrash,
  isVitestTimeout,
  parseHunks,
  revertHunk,
  revertHunks
} from './fork-hunk-guard-scan.mjs'

const OLD = ["import { a } from './a'", '', 'export function f() {', '  return a()', '}', ''].join(
  '\n'
)
const NEW = [
  "import { a } from './a'",
  "import { forkB } from './fork-b'",
  '',
  'export function f() {',
  '  // Fork: prefer the fork reader.',
  '  return forkB() ?? a()',
  '}',
  ''
].join('\n')
const DIFF = [
  'diff --git a/x.ts b/x.ts',
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -1,2 +1,3 @@',
  " import { a } from './a'",
  "+import { forkB } from './fork-b'",
  ' ',
  '@@ -3,3 +4,4 @@',
  ' export function f() {',
  '-  return a()',
  '+  // Fork: prefer the fork reader.',
  '+  return forkB() ?? a()',
  ' }'
].join('\n')

describe('fork hunk guard scan', () => {
  const hunks = parseHunks(DIFF)
  const context = { oldText: OLD, newText: NEW, path: 'x.ts' }

  it('reverts one hunk to the base side and leaves the other', () => {
    expect(revertHunk(NEW, hunks[1])).toBe(
      [
        "import { a } from './a'",
        "import { forkB } from './fork-b'",
        '',
        'export function f() {',
        '  return a()',
        '}',
        ''
      ].join('\n')
    )
    expect(revertHunk(NEW, hunks[0])).toBe(
      [
        "import { a } from './a'",
        '',
        'export function f() {',
        '  // Fork: prefer the fork reader.',
        '  return forkB() ?? a()',
        '}',
        ''
      ].join('\n')
    )
  })

  it('tests only hunks that change behaviour', () => {
    expect(hunks.map((hunk) => classifyHunk(hunk, context))).toEqual(['import', 'code'])
  })

  it('reverts code and imports together without shifting HEAD hunk offsets', () => {
    expect(revertHunks(NEW, hunks)).toBe(OLD)
    expect(revertHunks(NEW, [hunks[1], hunks[0]])).toBe(OLD)
  })

  it.each([
    ['(file failed to load)', 'unexpected token in dependency', true],
    ['save', 'ReferenceError: ORCA_EDITOR_FILE_SAVED_EVENT is not defined', true],
    ['save', 'TypeError: dispatchEditorFileSaved is not a function', true],
    [
      'save',
      '[vitest] No "dispatchEditorFileSaved" export is defined on the "./editor-file-saved-dispatch" mock.',
      true
    ],
    ['save', 'Failed to resolve import "./editor-file-saved-dispatch"', true],
    ['save', 'AssertionError: expected undefined to be "written"', false]
  ])('classifies crash for %s / %s as %s', (test, message, crash) => {
    expect(isCrash({ test, message })).toBe(crash)
  })

  it.each([
    [{ error: { code: 'ETIMEDOUT' }, signal: null }, true],
    [{ signal: 'SIGTERM' }, true],
    [{ signal: 'SIGKILL' }, true],
    [{ signal: 'SIGSEGV' }, false],
    [{ status: 1, signal: null }, false]
  ])('recognizes timeout result %j as %s', (result, timeout) => {
    expect(isVitestTimeout(result)).toBe(timeout)
  })

  it('leaves a type-only hunk to the typecheck', () => {
    const oldType = ['type File = {', '  path: string', '}', ''].join('\n')
    const newType = ['type File = {', '  path: string', '  gitWorktreeId?: string', '}', ''].join(
      '\n'
    )
    const [hunk] = parseHunks(
      [
        '@@ -1,3 +1,4 @@',
        ' type File = {',
        '   path: string',
        '+  gitWorktreeId?: string',
        ' }'
      ].join('\n')
    )
    expect(classifyHunk(hunk, { oldText: oldType, newText: newType, path: 'f.ts' })).toBe(
      'type-only'
    )
  })
})
