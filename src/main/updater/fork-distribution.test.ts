import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const appPath = { current: '' }
vi.mock('electron', () => ({ app: { getAppPath: () => appPath.current } }))

async function load(manifest: string | null): Promise<boolean> {
  vi.resetModules()
  appPath.current = mkdtempSync(join(tmpdir(), 'orca-fork-'))
  if (manifest !== null) {
    writeFileSync(join(appPath.current, 'package.json'), manifest)
  }
  const { isForkDistribution } = await import('./fork-distribution')
  try {
    return isForkDistribution()
  } finally {
    rmSync(appPath.current, { recursive: true, force: true })
  }
}

describe('isForkDistribution', () => {
  beforeEach(() => vi.resetModules())

  it('is true only when the packaged manifest carries the fork flag', async () => {
    expect(await load('{"name":"orca","orcaForkDistribution":true}')).toBe(true)
    expect(await load('{"name":"orca"}')).toBe(false)
    expect(await load('{"orcaForkDistribution":"true"}')).toBe(false)
  })

  it('is false when the manifest is missing or unreadable', async () => {
    expect(await load(null)).toBe(false)
    expect(await load('not json')).toBe(false)
  })
})
