import { describe, expect, it } from 'vitest'
import { isActiveEnvironmentOffline } from './runtime-status'
import type { RuntimeEnvironmentStatus } from './runtime-status'
import type { AppState } from '../types'

// Minimal state slices used by isActiveEnvironmentOffline
type TestState = Pick<AppState, 'settings' | 'runtimeStatusByEnvironmentId'>

function makeState(
  environmentId: string | null | undefined,
  statusEntry?: RuntimeEnvironmentStatus | undefined
): TestState {
  const map = new Map<string, RuntimeEnvironmentStatus>()
  if (environmentId && statusEntry !== undefined) {
    map.set(environmentId, statusEntry)
  }
  return {
    settings: { activeRuntimeEnvironmentId: environmentId ?? null } as never,
    runtimeStatusByEnvironmentId: map
  }
}

const connectedEntry: RuntimeEnvironmentStatus = {
  status: {
    runtimeId: 'r1',
    rendererGraphEpoch: 1,
    graphStatus: 'ready',
    authoritativeWindowId: null,
    liveTabCount: 0,
    liveLeafCount: 0
  },
  checkedAt: Date.now()
}

const failedEntry: RuntimeEnvironmentStatus = {
  status: null,
  checkedAt: Date.now()
}

describe('isActiveEnvironmentOffline', () => {
  it('returns false when the active target is local (no environmentId)', () => {
    const state = makeState(null)
    expect(isActiveEnvironmentOffline(state)).toBe(false)
  })

  it('returns false when the active target is local (empty string environmentId)', () => {
    const state = makeState('')
    expect(isActiveEnvironmentOffline(state)).toBe(false)
  })

  it('returns false when the active environment has a live status', () => {
    const state = makeState('env-1', connectedEntry)
    expect(isActiveEnvironmentOffline(state)).toBe(false)
  })

  it('returns true when the active environment has a null status (probe failed)', () => {
    const state = makeState('env-1', failedEntry)
    expect(isActiveEnvironmentOffline(state)).toBe(true)
  })

  it('returns true when the active environment has no status entry at all (never probed)', () => {
    // Map does not have an entry for env-1
    const state = makeState('env-1', undefined)
    expect(isActiveEnvironmentOffline(state)).toBe(true)
  })

  it('returns false when settings is null', () => {
    const state: TestState = {
      settings: null,
      runtimeStatusByEnvironmentId: new Map()
    }
    expect(isActiveEnvironmentOffline(state)).toBe(false)
  })
})
