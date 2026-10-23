// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCA_RENDERER_UNLOAD_PREVENTED_EVENT } from '../../../shared/renderer-shutdown-events'
import { ORCA_APP_RESTART_STARTED_EVENT } from '../../../shared/updater-renderer-events'
import { requestLazyChunkRecoveryReload } from './lazy-chunk-recovery-reload'
import {
  isIntentionalAppRestartInProgress,
  registerUpdaterBeforeUnloadBypass
} from './updater-beforeunload'

describe('requestLazyChunkRecoveryReload', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('refuses the reload when the staged checkpoint never reaches disk', async () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined)

    await expect(
      requestLazyChunkRecoveryReload(window, () =>
        Promise.reject(new Error('Failed to persist renderer state before unload.'))
      )
    ).resolves.toBe('checkpoint-refused')

    expect(reload).not.toHaveBeenCalled()
  })

  it('navigates only after the checkpoint is durably written', async () => {
    const order: string[] = []
    vi.spyOn(window.location, 'reload').mockImplementation(() => {
      order.push('reload')
      // A real landed reload destroys the document; veto so the wait settles.
      window.dispatchEvent(new Event(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT))
    })

    await expect(
      requestLazyChunkRecoveryReload(window, async () => {
        order.push('flushed')
      })
    ).resolves.toBe('unload-vetoed')

    expect(order).toEqual(['flushed', 'reload'])
  })

  it('joins the preload checkpoint before navigating when no override is supplied', async () => {
    const order: string[] = []
    let flush: () => void = () => undefined
    const awaitBeforeUnloadCheckpoint = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          flush = () => {
            order.push('flushed')
            resolve()
          }
        })
    )
    vi.stubGlobal('api', { app: { awaitBeforeUnloadCheckpoint } })
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {
      order.push('reload')
      window.dispatchEvent(new Event(ORCA_RENDERER_UNLOAD_PREVENTED_EVENT))
    })

    const outcome = requestLazyChunkRecoveryReload(window)
    await vi.waitFor(() => expect(awaitBeforeUnloadCheckpoint).toHaveBeenCalledTimes(1))
    expect(reload).not.toHaveBeenCalled()

    flush()

    await expect(outcome).resolves.toBe('unload-vetoed')
    expect(order).toEqual(['flushed', 'reload'])
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
})
