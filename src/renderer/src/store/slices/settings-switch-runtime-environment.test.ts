import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../types'
import type { SettingsSlice } from './settings'

const refreshRuntimeEnvironmentProjects = vi.fn(async () => {})
const clearRuntimeEnvironmentDirty = vi.fn()

vi.mock('./runtime-environment-project-refresh', () => ({
  refreshRuntimeEnvironmentProjects: (...args: unknown[]) =>
    refreshRuntimeEnvironmentProjects(...args)
}))
vi.mock('@/runtime/runtime-environment-refresh-dirty', () => ({
  markRuntimeEnvironmentDirty: vi.fn(),
  clearRuntimeEnvironmentDirty: (...args: unknown[]) => clearRuntimeEnvironmentDirty(...args),
  isRuntimeEnvironmentDirty: vi.fn(() => false)
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  clearRuntimeCompatibilityCache: vi.fn(),
  markRuntimeEnvironmentCompatible: vi.fn(),
  unwrapRuntimeRpcResult: vi.fn()
}))
vi.mock('@/runtime/runtime-protocol-compat', () => ({
  assertRuntimeStatusCompatible: vi.fn()
}))
vi.mock('@/lib/provider-runtime-context', () => ({
  bumpProviderRuntimeSessionGeneration: vi.fn()
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_id: string, fallback: string) => fallback }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('switchRuntimeEnvironment hydrate', () => {
  let fetchRepos: ReturnType<typeof vi.fn>
  let fetchAllWorktrees: ReturnType<typeof vi.fn>
  let fetchWorktreeLineage: ReturnType<typeof vi.fn>
  let fetchBrowserSessionProfiles: ReturnType<typeof vi.fn>
  let verifyReachable: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchRepos = vi.fn(async () => {})
    fetchAllWorktrees = vi.fn(async () => {})
    fetchWorktreeLineage = vi.fn(async () => {})
    fetchBrowserSessionProfiles = vi.fn(async () => {})
    verifyReachable = vi.fn(async () => {})
    // window.api.settings.set echoes the new active env id back.
    // runtimeEnvironments.getStatus is called by the module-level
    // verifyRuntimeEnvironmentReachable inside switchRuntimeEnvironment.
    vi.stubGlobal('window', {
      api: {
        settings: {
          set: vi.fn(async () => ({ activeRuntimeEnvironmentId: 'env-2' }))
        },
        runtimeEnvironments: {
          getStatus: vi.fn(async () => ({ ok: true, result: { status: 'connected' } }))
        }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function makeSlice() {
    const { createSettingsSlice } = await import('./settings')
    const state: Partial<AppState> = {
      settings: { activeRuntimeEnvironmentId: 'env-1' } as AppState['settings'],
      fetchRepos,
      fetchAllWorktrees,
      fetchWorktreeLineage,
      fetchBrowserSessionProfiles,
      verifyRuntimeEnvironmentReachable: verifyReachable
    } as Partial<AppState>
    const get = () => state as AppState
    const set = (partial: unknown) => {
      const next =
        typeof partial === 'function'
          ? (partial as (s: AppState) => unknown)(state as AppState)
          : partial
      Object.assign(state, next)
    }
    const slice = createSettingsSlice(set as never, get as never, {} as never) as SettingsSlice
    Object.assign(state, slice)
    return { slice, get }
  }

  it('hydrates the newly-active env via the shared primitive and clears its dirty flag', async () => {
    const { slice, get } = await makeSlice()
    const ok = await slice.switchRuntimeEnvironment('env-2')
    expect(ok).toBe(true)
    // One env-scoped hydrate against the newly-active env — never the cross-host scan.
    expect(refreshRuntimeEnvironmentProjects).toHaveBeenCalledWith({ getState: get }, 'env-2')
    expect(fetchAllWorktrees).not.toHaveBeenCalled()
    expect(clearRuntimeEnvironmentDirty).toHaveBeenCalledWith('env-2')
    // Browser session profiles are still hydrated on switch.
    expect(fetchBrowserSessionProfiles).toHaveBeenCalledTimes(1)
  })
})
