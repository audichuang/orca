import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as BundleReplacement from './app-bundle-replacement'

vi.mock('electron', () => ({ app: { isPackaged: true } }))

describe('isAppBundleReplaced', () => {
  const dirs: string[] = []
  let resources: string

  beforeEach(() => {
    vi.resetModules()
    resources = mkdtempSync(join(tmpdir(), 'orca-bundle-'))
    dirs.push(resources)
    writeFileSync(join(resources, 'app.asar'), 'v1')
    // Plain Node has no resourcesPath; Electron always sets it.
    Object.defineProperty(process, 'resourcesPath', { value: resources, configurable: true })
  })

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  async function launched(): Promise<typeof BundleReplacement> {
    const mod = await import('./app-bundle-replacement')
    mod.captureLaunchedAppBundle()
    return mod
  }

  it('stays false while the launched bundle is still installed', async () => {
    expect((await launched()).isAppBundleReplaced()).toBe(false)
  })

  it('detects a bundle swapped in by an in-place upgrade', async () => {
    const mod = await launched()
    writeFileSync(join(resources, 'app.asar.new'), 'v2')
    renameSync(join(resources, 'app.asar.new'), join(resources, 'app.asar'))
    expect(mod.isAppBundleReplaced()).toBe(true)
  })

  it('treats a bundle missing mid-install as replaced', async () => {
    const mod = await launched()
    rmSync(join(resources, 'app.asar'))
    expect(mod.isAppBundleReplaced()).toBe(true)
  })
})
