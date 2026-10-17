// Personal fork build (audichuang/orca), installed via the audichuang/tap `orca-fork` cask.
// Why the official appId and productName: Computer Use, press-and-hold and notification settings are
// keyed to com.stablyai.orca, and the CLI shim resolves `Contents/MacOS/Orca`. The cask installs the
// bundle as "Orca Fork.app"; userData is shared with the official app, so only one runs at a time.
const base = require('./electron-builder.config.cjs')

const version = process.env.ORCA_FORK_VERSION
if (!version || !/^\d+\.\d+\.\d+-fork\.\d+$/.test(version)) {
  throw new Error('Set ORCA_FORK_VERSION, e.g. 1.4.227-fork.1')
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  ...base,
  // Why orcaForkDistribution: the main process reads it to turn off the upstream auto-updater.
  extraMetadata: { ...base.extraMetadata, version, orcaForkDistribution: true },
  publish: null,
  mac: {
    ...base.mac,
    // Why: without a Developer ID the base config leaves the bundle unsigned, and the stock Electron
    // signature breaks once Info.plist is rewritten; sign every nested framework ad-hoc instead.
    identity: '-',
    target: [{ target: 'dmg', arch: ['arm64'] }]
  },
  dmg: { ...base.dmg, artifactName: 'orca-fork-macos-${arch}.${ext}' }
}
