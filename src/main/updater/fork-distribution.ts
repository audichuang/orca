import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

let cached: boolean | undefined

/**
 * True for the personal fork build (config/electron-builder.fork.config.cjs). Its feed would be
 * upstream's releases, which would silently replace the fork, so it updates through Homebrew only.
 */
export function isForkDistribution(): boolean {
  if (cached === undefined) {
    try {
      const manifest: unknown = JSON.parse(
        readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')
      )
      cached =
        typeof manifest === 'object' &&
        manifest !== null &&
        'orcaForkDistribution' in manifest &&
        manifest.orcaForkDistribution === true
    } catch {
      cached = false
    }
  }
  return cached
}
