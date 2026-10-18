export const TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES = 1024

// Why: POSIX-looking SSH paths are only meaningful inside their connection;
// local/runtime keys keep the legacy scope so existing hover probes stay hot.
export function getTerminalPathExistsCacheKey({
  absolutePath,
  connectionId,
  isRemoteRuntimePath,
  runtimeEnvironmentId
}: {
  absolutePath: string
  connectionId?: string | null
  isRemoteRuntimePath?: boolean
  runtimeEnvironmentId?: string | null
}): string {
  const runtimeId = runtimeEnvironmentId?.trim()
  if (isRemoteRuntimePath && runtimeId) {
    return `${runtimeId}\0${absolutePath}`
  }
  const sshConnectionId = connectionId?.trim()
  if (sshConnectionId) {
    return `ssh:${sshConnectionId}\0${absolutePath}`
  }
  return `${runtimeId || 'active'}\0${absolutePath}`
}

export function readTerminalPathExistsCache<T>(cache: Map<string, T>, key: string): T | undefined {
  const value = cache.get(key)
  if (value !== undefined) {
    cache.delete(key)
    cache.set(key, value)
  }
  return value
}

export function writeTerminalPathExistsCache<T>(
  cache: Map<string, T>,
  key: string,
  value: T
): void {
  if (cache.has(key)) {
    cache.delete(key)
  } else {
    // Why: terminal output can contain unbounded unique paths during long
    // sessions; keep recent link probes without retaining every path forever.
    while (cache.size >= TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      cache.delete(oldestKey)
    }
  }
  cache.set(key, value)
}

export const TERMINAL_PATH_MISSING_CACHE_TTL_MS = 3_000

/** Records a terminal link probe; a miss expires so a file written after its path printed still links. */
export function writeTerminalPathExistsAnswer(
  cache: Map<string, boolean>,
  key: string,
  exists: boolean
): void {
  writeTerminalPathExistsCache(cache, key, exists)
  if (exists) {
    return
  }
  // Why: agents print `Write(/tmp/x.html)` before the file exists; a lasting miss kills the link.
  setTimeout(() => {
    if (cache.get(key) === false) {
      cache.delete(key)
    }
  }, TERMINAL_PATH_MISSING_CACHE_TTL_MS)
}
