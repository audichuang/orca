import { afterEach, describe, expect, it } from 'vitest'
import {
  clearRuntimeEnvironmentDirty,
  isRuntimeEnvironmentDirty,
  markRuntimeEnvironmentDirty
} from './runtime-environment-refresh-dirty'

describe('runtime-environment-refresh-dirty', () => {
  afterEach(() => {
    // The set is module-private state shared across tests; reset known ids.
    clearRuntimeEnvironmentDirty('env-1')
    clearRuntimeEnvironmentDirty('env-2')
  })

  it('reports a freshly marked environment as dirty', () => {
    expect(isRuntimeEnvironmentDirty('env-1')).toBe(false)
    markRuntimeEnvironmentDirty('env-1')
    expect(isRuntimeEnvironmentDirty('env-1')).toBe(true)
  })

  it('clearing one environment leaves others dirty', () => {
    markRuntimeEnvironmentDirty('env-1')
    markRuntimeEnvironmentDirty('env-2')
    clearRuntimeEnvironmentDirty('env-1')
    expect(isRuntimeEnvironmentDirty('env-1')).toBe(false)
    expect(isRuntimeEnvironmentDirty('env-2')).toBe(true)
  })

  it('marking the same environment twice is idempotent', () => {
    markRuntimeEnvironmentDirty('env-1')
    markRuntimeEnvironmentDirty('env-1')
    expect(isRuntimeEnvironmentDirty('env-1')).toBe(true)
    clearRuntimeEnvironmentDirty('env-1')
    expect(isRuntimeEnvironmentDirty('env-1')).toBe(false)
  })
})
