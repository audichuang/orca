import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { forkMacHelperErrors } from './fork-mac-helpers.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const pkg = (release) => JSON.stringify({ scripts: { 'build:mac:release': release } })
const RELEASE =
  'ORCA_MAC_RELEASE=1 pnpm run build:desktop && ORCA_MAC_RELEASE=1 pnpm run build:computer-macos && ORCA_MAC_RELEASE=1 pnpm run build:process-footprint-macos && electron-builder --mac'
const MISSING =
  'fork-mac-helpers: `build:mac:release` runs `build:process-footprint-macos` but the Makefile `computer-use` target does not; fork-dmg would ship without that helper'

describe('forkMacHelperErrors', () => {
  it('accepts the repo Makefile against upstream build:mac:release', () => {
    expect(
      forkMacHelperErrors(
        readFileSync(join(ROOT, 'package.json'), 'utf8'),
        readFileSync(join(ROOT, 'Makefile'), 'utf8')
      )
    ).toEqual([])
  })

  it('accepts helpers built inside a shell conditional of the target', () => {
    const makefile = `computer-use:
\t@if [ ! -d x ]; then \\
\t\tpnpm run build:computer-macos; \\
\tfi
\tpnpm run build:process-footprint-macos -- --single-arch

setup:
`
    expect(forkMacHelperErrors(pkg(RELEASE), makefile)).toEqual([])
  })

  it('rejects a release helper the target does not build, even when another target does', () => {
    const makefile = `computer-use:
\tpnpm run build:computer-macos
\tpnpm run build:process-footprint-macos-legacy

other:
\tpnpm run build:process-footprint-macos
`
    expect(forkMacHelperErrors(pkg(RELEASE), makefile)).toEqual([MISSING])
  })

  it('fails closed when upstream renames the release script or the target disappears', () => {
    expect(forkMacHelperErrors(JSON.stringify({ scripts: {} }), 'computer-use:\n')).toEqual([
      'fork-mac-helpers: package.json has no `build:mac:release` script to read helpers from'
    ])
    expect(forkMacHelperErrors(pkg('electron-builder --mac'), 'computer-use:\n')).toEqual([
      'fork-mac-helpers: `build:mac:release` runs no `build:*-macos` script; the pattern is stale'
    ])
    expect(forkMacHelperErrors(pkg(RELEASE), 'build:\n\tpnpm run build:computer-macos\n')).toEqual([
      'fork-mac-helpers: Makefile has no `computer-use` target'
    ])
  })
})
