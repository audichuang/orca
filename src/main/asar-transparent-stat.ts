// Fork-only: the statSync sibling of asar-transparent-fs.ts's rm, resolved from original-fs the same way.
import { statSync as nodeStatSync } from 'node:fs'
import { createRequire } from 'node:module'

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
