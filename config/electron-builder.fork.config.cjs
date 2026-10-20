// Personal fork build (audichuang/orca), installed via the audichuang/tap `orca-fork` cask.
// Why the official appId and productName: Computer Use, press-and-hold and notification settings are
// keyed to com.stablyai.orca, and the CLI shim resolves `Contents/MacOS/Orca`. The cask installs the
// bundle as "Orca Fork.app"; userData is shared with the official app, so only one runs at a time.
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const base = require('./electron-builder.config.cjs')

// Why: base `files` is a denylist, so local fork builds shipped untracked and ignored checkout entries
// (Orca drop screenshots, CLAUDE.local.md, .codegraph) in public dmgs. out/ and node_modules/ are the
// only untracked inputs the app needs.
const UNTRACKED_BUILD_INPUTS = new Set(['out', 'node_modules'])
function untrackedTopLevelExcludes() {
  const listed = execFileSync('git', ['ls-files', '--others', '--directory', '-z'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const names = new Set(
    listed
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.split('/')[0])
  )
  return [...names]
    .filter((name) => !UNTRACKED_BUILD_INPUTS.has(name))
    .map((name) => `!${name.replace(/[[\]{}()*?!+@]/g, '\\$&')}{,/**/*}`)
}

const version = process.env.ORCA_FORK_VERSION
if (!version || !/^\d+\.\d+\.\d+-fork\.\d+$/.test(version)) {
  throw new Error('Set ORCA_FORK_VERSION, e.g. 1.4.227-fork.1')
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  // Why orcaForkDistribution: the main process reads it to turn off the upstream auto-updater.
  extraMetadata: { ...base.extraMetadata, version, orcaForkDistribution: true },
  files: [...base.files, ...untrackedTopLevelExcludes()],
  publish: null,
  mac: {
    ...base.mac,
    // Why a stable self-signed identity: ad-hoc signatures change every build, so keychain "Always
    // Allow" and TCC grants reset on each update. '-' (ad-hoc) remains for machines without the cert.
    identity: process.env.ORCA_FORK_SIGN_IDENTITY || '-',
    // Why: the fork is never notarized and the cert outlives any release; Apple's timestamp server added ~1s per signed file.
    timestamp: 'none',
    target: [{ target: 'dmg', arch: ['arm64'] }]
  },
  dmg: { ...base.dmg, artifactName: 'orca-fork-macos-${arch}.${ext}' }
}
