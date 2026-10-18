// Fork seam guard: a paired-server link miss must expire like a local one (8e7db4dedb).
import { afterEach, describe, expect, it, vi } from 'vitest'

const resolveHostWorkspaceFile = vi.hoisted(() => vi.fn())
vi.mock('./terminal-host-workspace-file', () => ({
  HostFileRefusal: class HostFileRefusal extends Error {},
  resolveHostWorkspaceFile
}))

import { hostFileLinkTargetExists } from './terminal-host-file-link-existence'
import { TERMINAL_PATH_MISSING_CACHE_TTL_MS } from './terminal-path-exists-cache'
import type { FileLinkTarget } from './terminal-file-link-target'

afterEach(() => {
  vi.useRealTimers()
})

describe('hostFileLinkTargetExists miss expiry', () => {
  it('re-asks the host once a miss expires', async () => {
    vi.useFakeTimers()
    resolveHostWorkspaceFile.mockResolvedValueOnce(null).mockResolvedValue({ path: '/srv/x.html' })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the host check reads only absolutePath, cacheKey and fileContext.
    const target = {
      absolutePath: '/srv/x.html',
      cacheKey: 'host:/srv/x.html',
      fileContext: {}
    } as FileLinkTarget
    const cache = new Map<string, boolean>()

    expect(await hostFileLinkTargetExists(target, cache, 'h')).toBe(false)
    vi.advanceTimersByTime(TERMINAL_PATH_MISSING_CACHE_TTL_MS)
    expect(await hostFileLinkTargetExists(target, cache, 'h')).toBe(true)
    expect(resolveHostWorkspaceFile).toHaveBeenCalledTimes(2)
  })
})
