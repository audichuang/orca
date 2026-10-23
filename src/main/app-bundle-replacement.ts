import { join } from 'node:path'
import { app } from 'electron'
import { statSync } from './asar-transparent-fs'

type BundleIdentity = { ino: number; mtimeMs: number }

let launchedBundle: BundleIdentity | null = null

function readBundleIdentity(): BundleIdentity | null {
  try {
    // Physical stat: Electron's patched fs returns a fresh virtual directory for app.asar each call.
    const stat = statSync(join(process.resourcesPath, 'app.asar'))
    return { ino: stat.ino, mtimeMs: stat.mtimeMs }
  } catch {
    return null
  }
}

/** Records the app.asar this process launched from; call once at startup. */
export function captureLaunchedAppBundle(): void {
  if (app.isPackaged) {
    launchedBundle = readBundleIdentity()
  }
}

/** True once an in-place install (e.g. `brew upgrade`) replaced the bundle under this running process. */
export function isAppBundleReplaced(): boolean {
  if (!launchedBundle) {
    return false
  }
  const current = readBundleIdentity()
  return (
    !current || current.ino !== launchedBundle.ino || current.mtimeMs !== launchedBundle.mtimeMs
  )
}
