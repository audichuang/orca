import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as BundleReplacement from './app-bundle-replacement'

const { statSync } = vi.hoisted(() => ({ statSync: vi.fn() }))
vi.mock('node:fs', () => ({ statSync }))
vi.mock('electron', () => ({ app: { isPackaged: true } }))

describe('isAppBundleReplaced', () => {
  beforeEach(() => {
    vi.resetModules()
    // Plain Node has no resourcesPath; Electron always sets it.
    Object.defineProperty(process, 'resourcesPath', { value: '/app/Resources', configurable: true })
    statSync.mockReset()
    statSync.mockReturnValue({ ino: 1, mtimeMs: 100 })
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
    statSync.mockReturnValue({ ino: 2, mtimeMs: 200 })
    expect(mod.isAppBundleReplaced()).toBe(true)
  })

  it('treats a bundle missing mid-install as replaced', async () => {
    const mod = await launched()
    statSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(mod.isAppBundleReplaced()).toBe(true)
  })
})
