import { describe, expect, it } from 'vitest'
import { classifyHunk, parseHunks, revertHunk } from './fork-hunk-guard-scan.mjs'

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
