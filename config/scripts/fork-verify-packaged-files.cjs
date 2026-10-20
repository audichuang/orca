// Fork-only: fails a fork dmg whose app.asar ships a top-level entry git does not track.
// Usage: node config/scripts/fork-verify-packaged-files.cjs <path/to/app.asar>
const { execFileSync } = require('node:child_process')
const path = require('node:path')

// Why: the only untracked inputs the app needs; everything else at the top level must be in git.
const UNTRACKED_BUILD_INPUTS = ['out', 'node_modules']

function topLevelNames(paths) {
  return new Set(
    paths.map((entry) => entry.replace(/^[/\\]+/, '').split(/[/\\]/)[0]).filter(Boolean)
  )
}

/** Top-level asar entries that are neither tracked by git nor a known build input. */
function unexpectedPackagedEntries(asarPaths, trackedPaths) {
  const allowed = topLevelNames(trackedPaths)
  for (const name of UNTRACKED_BUILD_INPUTS) {
    allowed.add(name)
  }
  return [...topLevelNames(asarPaths)].filter((name) => !allowed.has(name)).sort()
}

function main(asarFile) {
  const repoRoot = path.join(__dirname, '..', '..')
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
    .split('\0')
    .filter(Boolean)
  const { listPackage } = require('@electron/asar')
  const unexpected = unexpectedPackagedEntries(listPackage(asarFile, { isPack: false }), tracked)
  if (unexpected.length > 0) {
    console.error(
      `[fork-verify-packaged-files] untracked entries in ${asarFile}: ${unexpected.join(', ')}`
    )
    process.exit(1)
  }
  console.log(
    '[fork-verify-packaged-files] OK — app.asar ships only tracked files, out/ and node_modules/'
  )
}

if (require.main === module) {
  main(process.argv[2])
}

module.exports = { unexpectedPackagedEntries }
