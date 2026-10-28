// Fork-only: fails a fork build whose .app lacks a `Contents/MacOS` helper the builder config packages.
// Why: electron-builder skips a missing extraFile and afterPack only throws in a Developer-ID release, so the
// ad-hoc PR build passed while v1.4.243-fork.1's release failed on `orca-process-footprint`.
// Usage: node config/scripts/fork-verify-mac-helpers.cjs <path/to/Orca.app>
const { existsSync } = require('node:fs')
const path = require('node:path')

/** `Contents/`-relative paths of the macOS extraFiles packaged into `Contents/MacOS`. */
function macHelperPaths(builderConfig) {
  return (builderConfig.mac?.extraFiles ?? [])
    .map((entry) => (typeof entry === 'string' ? entry : entry.to))
    .filter((to) => typeof to === 'string' && to.startsWith('MacOS/'))
}

function missingMacHelpers(appPath, helperPaths, exists = existsSync) {
  return helperPaths.filter((to) => !exists(path.join(appPath, 'Contents', to)))
}

function main(appPath) {
  const helpers = macHelperPaths(require('../electron-builder.config.cjs'))
  if (helpers.length === 0) {
    console.error('[fork-verify-mac-helpers] the builder config packages no MacOS/ extraFile; the check is stale')
    process.exit(1)
  }
  const missing = missingMacHelpers(appPath, helpers)
  if (missing.length > 0) {
    console.error(
      `[fork-verify-mac-helpers] ${appPath} lacks ${missing.map((to) => `Contents/${to}`).join(', ')}; build it in the Makefile computer-use target`
    )
    process.exit(1)
  }
  console.log(`[fork-verify-mac-helpers] OK — ${helpers.join(', ')}`)
}

if (require.main === module) {
  main(process.argv[2])
}

module.exports = { macHelperPaths, missingMacHelpers }
