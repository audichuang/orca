import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { unexpectedPackagedEntries } = require('./fork-verify-packaged-files.cjs')

describe('unexpectedPackagedEntries', () => {
  const tracked = ['package.json', 'resources/icon.png', '.oxlintrc.json', 'FORK.md']

  it('accepts tracked files plus out/ and node_modules/', () => {
    expect(
      unexpectedPackagedEntries(
        [
          '/package.json',
          '/resources/icon.png',
          '/.oxlintrc.json',
          '/out/main/index.js',
          '/node_modules/a/index.js'
        ],
        tracked
      )
    ).toEqual([])
  })

  it('flags untracked checkout entries such as drops and private notes', () => {
    expect(
      unexpectedPackagedEntries(
        ['/package.json', '/.orca/drops/shot.png', '/CLAUDE.local.md', '/.codegraph/codegraph.db'],
        tracked
      )
    ).toEqual(['.codegraph', '.orca', 'CLAUDE.local.md'])
  })
})
