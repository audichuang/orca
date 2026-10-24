// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../../../shared/renderer-shutdown-events'
import { ORCA_APP_RESTART_STARTED_EVENT } from '../../../shared/updater-renderer-events'
import { requestLazyChunkRecoveryReload } from './lazy-chunk-recovery-reload'
import {
  isIntentionalAppRestartInProgress,
  registerUpdaterBeforeUnloadBypass
} from './updater-beforeunload'

describe('requestLazyChunkRecoveryReload after the installed bundle was replaced', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('restarts instead of reloading once the installed bundle was replaced', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined)
    const relaunch = vi.fn()
    const restart = vi.fn(async () => {
      window.dispatchEvent(new Event(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT))
    })
    vi.stubGlobal('api', { app: { isBundleReplaced: async () => true, restart, relaunch } })

    await expect(requestLazyChunkRecoveryReload(window)).resolves.toBe('unload-vetoed')

    expect(restart).toHaveBeenCalledTimes(1)
    expect(relaunch).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('clears the restart latch when main vetoes the recovery restart', async () => {
    vi.useFakeTimers()
    const unregister = registerUpdaterBeforeUnloadBypass()
    try {
      // Preload arms the latch, then main declines to quit and the document survives.
      const restart = vi.fn(async () => {
        window.dispatchEvent(new Event(ORCA_APP_RESTART_STARTED_EVENT))
      })
      vi.stubGlobal('api', { app: { isBundleReplaced: async () => true, restart } })

      const outcome = requestLazyChunkRecoveryReload(window)
      await vi.waitFor(() => expect(isIntentionalAppRestartInProgress()).toBe(true))
      await vi.advanceTimersByTimeAsync(10_000)

      await expect(outcome).resolves.toBe('never-landed')
      expect(isIntentionalAppRestartInProgress()).toBe(false)
    } finally {
      unregister()
      vi.useRealTimers()
    }
  })

  it('starts the grace window only after a slow restart checkpoint completes', async () => {
    vi.useFakeTimers()
    const unregister = registerUpdaterBeforeUnloadBypass()
    try {
      // The durable checkpoint may take longer than the grace window before main quits.
      const restart = vi.fn(async () => {
        window.dispatchEvent(new Event(ORCA_APP_RESTART_STARTED_EVENT))
        await new Promise((resolve) => setTimeout(resolve, 12_000))
      })
      vi.stubGlobal('api', { app: { isBundleReplaced: async () => true, restart } })
      let settled = false
      const outcome = requestLazyChunkRecoveryReload(window).finally(() => {
        settled = true
      })

      await vi.advanceTimersByTimeAsync(12_000)
      expect(settled).toBe(false)
      expect(isIntentionalAppRestartInProgress()).toBe(true)

      await vi.advanceTimersByTimeAsync(10_000)
      await expect(outcome).resolves.toBe('never-landed')
    } finally {
      unregister()
      vi.useRealTimers()
    }
  })
})
