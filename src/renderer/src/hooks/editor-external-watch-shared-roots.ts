import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import type { EditorExternalWatchTarget } from './editor-external-watch-targets'

type IpcWatchTarget = Pick<
  EditorExternalWatchTarget,
  'worktreePath' | 'connectionId' | 'runtimeEnvironmentId'
>

// Why: main keys fs:watchWorktree by (root, renderer), so two workspaces on one folder share a
// single subscription — one unwatch would silence both. Only runtime targets own private handles.
function ipcRootKey(target: IpcWatchTarget): string | null {
  if (target.runtimeEnvironmentId) {
    return null
  }
  return `${target.connectionId ?? 'local'}::${normalizeRuntimePathForComparison(target.worktreePath)}`
}

/** Splits a target diff into the watch/unwatch IPC calls that keep each shared root alive. */
export function planSharedRootWatchIpc<T extends IpcWatchTarget>(
  previousTargets: readonly T[],
  nextTargets: readonly T[],
  removed: readonly T[],
  added: readonly T[]
): { unwatch: T[]; watch: T[] } {
  const rootsIn = (targets: readonly T[]): Set<string> =>
    new Set(targets.map(ipcRootKey).filter((key): key is string => key !== null))
  const previousRoots = rootsIn(previousTargets)
  const nextRoots = rootsIn(nextTargets)
  const unwatched = new Set<string>()
  const watched = new Set<string>()
  const unwatch = removed.filter((target) => {
    const key = ipcRootKey(target)
    if (key === null) {
      return true
    }
    if (nextRoots.has(key) || unwatched.has(key)) {
      return false
    }
    unwatched.add(key)
    return true
  })
  const watch = added.filter((target) => {
    const key = ipcRootKey(target)
    if (key === null) {
      return true
    }
    if (previousRoots.has(key) || watched.has(key)) {
      return false
    }
    watched.add(key)
    return true
  })
  return { unwatch, watch }
}

/** One target per shared IPC root, for the final teardown. */
export function dedupeSharedRootTargets<T extends IpcWatchTarget>(targets: readonly T[]): T[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = ipcRootKey(target)
    if (key === null) {
      return true
    }
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
