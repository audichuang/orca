import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { exportedNames, pinProblems } from './fork-upstream-api.mjs'

const root = mkdtempSync(join(tmpdir(), 'fork-upstream-api-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function write(source, siblings = {}) {
  const dir = mkdtempSync(join(root, 'case-'))
  for (const [name, text] of Object.entries(siblings)) {
    writeFileSync(join(dir, name), text)
  }
  const file = join(dir, 'entry.ts')
  writeFileSync(file, source)
  return file
}

describe('exportedNames', () => {
  it.each([
    ['default function is not a named export', 'export default function X() {}', false],
    ['an alias exports the alias, not the local', 'const X = 1\nexport { X as Y }', false],
    ['an export inside a block comment', '/*\nexport const X = 1\n*/', false],
    ['an export inside a template literal', 'const s = `\nexport const X = 1\n`', false],
    ['an indented declaration', 'namespace N {}\n  export const X = 1', true],
    ['a comment between export and const', 'export /* c */ const X = 1', true],
    ['a later declarator', 'export const A = 1,\n  X = 2', true],
    ['a destructured declarator', 'export const { a: X } = { a: 1 }', true],
    ['the exported side of an alias', 'const local = 1\nexport { local as X }', true],
    ['a type-only re-export', "export type { X } from './other'", true],
    ['an exported type', 'export type X = string', true]
  ])('%s', (_label, source, exported) => {
    expect(exportedNames(write(source)).has('X')).toBe(exported)
  })

  it('follows star re-exports, nested ones too, but not their default', () => {
    const file = write("export * from './a'", {
      'a.ts': "export * from './b.js'\nexport default 1",
      'b.ts': 'export function X() {}'
    })
    expect(exportedNames(file).has('X')).toBe(true)
    expect(exportedNames(file).has('default')).toBe(false)
  })

  it('names a namespace re-export by its alias', () => {
    const file = write("export * as X from './a'", { 'a.ts': 'export const Y = 1' })
    expect([...exportedNames(file)]).toEqual(['X'])
  })

  it('reports default only when pinned as default', () => {
    expect(exportedNames(write('export default function X() {}')).has('default')).toBe(true)
    expect(exportedNames(write('const X = 1\nexport default X')).has('default')).toBe(true)
  })

  it('survives a star re-export cycle', () => {
    const file = write("export * from './a'\nexport const X = 1", {
      'a.ts': "export * from './entry'"
    })
    expect(exportedNames(file).has('X')).toBe(true)
  })
})

describe('pinProblems', () => {
  it('flags a missing export, a missing file and a malformed line', () => {
    const file = write('const X = 1')
    const list = `# comment\n${file} X\n${file}.gone X\n${file}\n`
    expect(pinProblems(list, '/').problems).toEqual([
      `${file}: no longer exports X, which the fork reads`,
      `${file}.gone: file is gone, but the fork reads its export X`,
      `config/fork-upstream-api.txt: malformed line "${file}" (want "<path> <symbol>")`
    ])
  })
})
