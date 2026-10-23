// Electron treats .asar files as directories; unpatched fs prevents recursive rm failures.
// Avoid process.noAsar: other main-process work may load app.asar during a long removal.

import { statSync as nodeStatSync } from 'node:fs'
import { rm as nodeRm } from 'node:fs/promises'
import { createRequire } from 'node:module'

type Rm = typeof nodeRm

let resolvedRm: Rm | undefined

function resolveRm(): Rm {
  try {
    // Resolve lazily: original-fs exists only in Electron; plain Node’s fs is already unpatched.
    const originalFs = createRequire(__filename)('original-fs') as { promises?: { rm?: Rm } }
    return typeof originalFs.promises?.rm === 'function' ? originalFs.promises.rm : nodeRm
  } catch {
    return nodeRm
  }
}

/** `fs.promises.rm` that sees a `*.asar` as the file it is rather than as a directory. */
export const rm: Rm = (path, options) => {
  resolvedRm ??= resolveRm()
  return resolvedRm(path, options)
}

type StatSync = typeof nodeStatSync

let resolvedStatSync: StatSync | undefined

function resolveStatSync(): StatSync {
  try {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: original-fs mirrors fs; the typeof check below guards the shape.
    const originalFs = createRequire(__filename)('original-fs') as { statSync?: StatSync }
    return typeof originalFs.statSync === 'function' ? originalFs.statSync : nodeStatSync
  } catch {
    return nodeStatSync
  }
}

/** `fs.statSync` that stats a `*.asar` as the physical file, not a virtual directory. */
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the wrapper forwards every overload's args unchanged to the resolved statSync.
export const statSync = ((...args: Parameters<StatSync>) => {
  resolvedStatSync ??= resolveStatSync()
  return resolvedStatSync(...args)
}) as StatSync
