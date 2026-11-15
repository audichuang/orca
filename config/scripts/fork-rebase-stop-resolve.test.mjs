import { describe, expect, it } from 'vitest'
import { resolveImportHunks } from './fork-rebase-stop-resolve.mjs'

function hunk(ours, base, theirs) {
  return [
    '<<<<<<< ours',
    ...ours,
    '||||||| base',
    ...base,
    '=======',
    ...theirs,
    '>>>>>>> theirs'
  ].join('\n')
}

describe('resolveImportHunks', () => {
  it("keeps upstream's moved paths and adds the import this commit added", () => {
    const text = hunk(
      ["import { a } from './panel/a'"],
      ["import { a } from './a'"],
      ["import { a } from './a'", "import { fork } from './fork-thing'"]
    )
    expect(resolveImportHunks(text)).toEqual({
      text: "import { a } from './panel/a'\nimport { fork } from './fork-thing'",
      resolved: 1,
      left: 0
    })
  })

  it('drops an import this commit removed even though upstream moved it', () => {
    const text = hunk(
      ["import { a } from './panel/a'", "import { b } from './panel/b'"],
      ["import { a } from './a'", "import { b } from './b'"],
      ["import { a } from './a'"]
    )
    expect(resolveImportHunks(text).text).toBe("import { a } from './panel/a'")
  })

  it("follows this commit's switch to a module with another name", () => {
    const text = hunk(
      ["import { Provider } from './review/context'"],
      ["import { Provider } from './context'"],
      ["import { Provider } from './fork-context'"]
    )
    expect(resolveImportHunks(text).text).toBe("import { Provider } from './fork-context'")
  })

  it('leaves a hunk with code untouched', () => {
    const text = hunk(['const a = 1'], ['const a = 0'], ['const a = 2'])
    expect(resolveImportHunks(text)).toEqual({ text, resolved: 0, left: 1 })
  })
})
