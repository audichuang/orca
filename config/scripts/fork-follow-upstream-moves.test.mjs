import { describe, expect, it } from 'vitest'
import { rewriteSpecifiers } from './fork-follow-upstream-moves.mjs'

const renames = new Map([
  ['src/shared/scope.ts', 'src/shared/workspace/scope.ts'],
  [
    'src/renderer/src/components/editor/Panel.tsx',
    'src/renderer/src/components/editor/panel/Panel.tsx'
  ],
  ['src/shared/barrel.ts', 'src/shared/barrel-gone.ts']
])
const oldFiles = new Set([
  'src/shared/scope.ts',
  'src/shared/barrel.ts',
  'src/renderer/src/components/editor/Panel.tsx',
  'src/renderer/src/components/editor/fork-helper.ts'
])
const newFiles = new Set([
  'src/shared/workspace/scope.ts',
  'src/renderer/src/components/editor/panel/Panel.tsx',
  'src/renderer/src/components/editor/fork-helper.ts'
])

function run(text, newPath, oldPath = newPath) {
  return rewriteSpecifiers({
    text,
    newPath,
    oldPath,
    renames,
    isNewFile: (path) => newFiles.has(path),
    isOldFile: (path) => oldFiles.has(path)
  })
}

describe('rewriteSpecifiers', () => {
  it('points a fork file at the module upstream moved, in imports and vi.mock strings', () => {
    const result = run(
      "import { scope } from '../../../../shared/scope'\nvi.mock('../../../../shared/scope', () => ({}))\n",
      'src/renderer/src/components/editor/fork-helper.ts'
    )
    expect(result.text).toBe(
      "import { scope } from '../../../../shared/workspace/scope'\nvi.mock('../../../../shared/workspace/scope', () => ({}))\n"
    )
  })

  it("points a moved upstream file's fork import back at the fork file that stayed", () => {
    const result = run(
      "import { help } from './fork-helper'\n",
      'src/renderer/src/components/editor/panel/Panel.tsx',
      'src/renderer/src/components/editor/Panel.tsx'
    )
    expect(result.text).toBe("import { help } from '../fork-helper'\n")
  })

  it('keeps the alias style', () => {
    const result = run("import { Panel } from '@/components/editor/Panel'\n", 'src/main/x.ts')
    expect(result.text).toBe("import { Panel } from '@/components/editor/panel/Panel'\n")
  })

  it('leaves a specifier that still resolves, and lists one that never did', () => {
    const result = run(
      "import { help } from './fork-helper'\nvi.mock('./missing')\n",
      'src/renderer/src/components/editor/other.ts'
    )
    expect(result.fixes).toEqual([])
    expect(result.unresolved).toEqual(['./missing'])
  })

  it('reports a target upstream removed instead of guessing', () => {
    const result = run("import { a } from '../shared/barrel'\n", 'src/main/x.ts')
    expect(result.gone).toEqual([{ spec: '../shared/barrel', target: 'src/shared/barrel-gone.ts' }])
    expect(result.text).toBe("import { a } from '../shared/barrel'\n")
  })
})
