// Electron treats .asar files as directories; unpatched fs prevents recursive rm failures.
// Avoid process.noAsar: other main-process work may load app.asar during a long removal.

import { statSync as nodeStatSync } from 'node:fs'
import * as nodeFs from 'node:fs/promises'
import { createRequire } from 'node:module'

let resolvedFs: typeof nodeFs | undefined

function nativeFs(): typeof nodeFs {
  if (!resolvedFs) {
    try {
      // Resolve lazily: original-fs exists only in Electron; plain Node's fs is already unpatched.
      const originalFs: { promises?: typeof nodeFs } = createRequire(__filename)('original-fs')
      resolvedFs = originalFs.promises ?? nodeFs
    } catch {
      resolvedFs = nodeFs
    }
  }
  return resolvedFs
}

/** `fs.promises.rm` that sees a `*.asar` as the file it is rather than as a directory. */
export const rm: typeof nodeFs.rm = (path, options) => nativeFs().rm(path, options)
export const readdir = (path: string): Promise<string[]> => nativeFs().readdir(path)
export const unlink = (path: string): Promise<void> => nativeFs().unlink(path)
export const rmdir = (path: string): Promise<void> => nativeFs().rmdir(path)
export const lstat = (path: string) => nativeFs().lstat(path)

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
