import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { macHelperPaths, missingMacHelpers } = require('./fork-verify-mac-helpers.cjs')

describe('fork-verify-mac-helpers', () => {
  it('reads every MacOS/ extraFile from the upstream builder config', () => {
    expect(macHelperPaths(require('../electron-builder.config.cjs'))).toContain(
      'MacOS/orca-process-footprint'
    )
  })

  it('names the helpers missing from the built app', () => {
    const built = new Set(['/dist/Orca.app/Contents/MacOS/orca-keyboard-layout'])
    expect(
      missingMacHelpers(
        '/dist/Orca.app',
        ['MacOS/orca-keyboard-layout', 'MacOS/orca-process-footprint'],
        (file) => built.has(file)
      )
    ).toEqual(['MacOS/orca-process-footprint'])
  })
})
