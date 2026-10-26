import { describe, expect, it, vi } from 'vitest'
import {
  installTerminalTestGlobals,
  restoreTerminalTestGlobals
} from './pty-connection-test-environment'

describe('pty-connection test environment', () => {
  it('stops real timers a test leaves behind so they cannot fire into the next test', async () => {
    await installTerminalTestGlobals()
    let restored = false
    let fired = 0
    // Stand-ins for an undisposed session's retry and poll loops; under load restore can outlast the delay.
    setTimeout(() => {
      fired += restored ? 1 : 0
    }, 50)
    setInterval(() => {
      fired += restored ? 1 : 0
    }, 50)

    await restoreTerminalTestGlobals()
    restored = true
    await new Promise<void>((resolve) => setTimeout(resolve, 120))

    expect(fired).toBe(0)
  })

  it('clears, from an instance re-imported after resetModules, timers started before the reset', async () => {
    await installTerminalTestGlobals()
    let restored = false
    let fired = 0
    // Why count only after restore: a loaded run can spend longer than the delay re-importing.
    setTimeout(() => {
      fired += restored ? 1 : 0
    }, 200)
    setInterval(() => {
      fired += restored ? 1 : 0
    }, 200)

    vi.resetModules()
    const reloaded = await import('./pty-connection-test-environment')
    await reloaded.installTerminalTestGlobals()
    await reloaded.restoreTerminalTestGlobals()
    restored = true
    await new Promise<void>((resolve) => setTimeout(resolve, 300))

    expect(fired).toBe(0)
  })
})
