import { describe, expect, it } from 'vitest'
import { resolveProjectGroupDeleteAction } from './project-group-delete-action'
import type { ProjectGroup } from '../../../../shared/types'
import type { RuntimeEnvironmentStatus } from '@/store/slices/runtime-status'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'

const ENV_ID = 'env-abc123'
const RUNTIME_HOST_ID = toRuntimeExecutionHostId(ENV_ID)
const OTHER_ENV_ID = 'env-other'
const OTHER_RUNTIME_HOST_ID = toRuntimeExecutionHostId(OTHER_ENV_ID)

const settingsWithEnv = { activeRuntimeEnvironmentId: ENV_ID }
const settingsLocal = { activeRuntimeEnvironmentId: null }

const liveStatus: RuntimeStatus = {
  runtimeId: ENV_ID,
  rendererGraphEpoch: 1,
  graphStatus: 'ready',
  authoritativeWindowId: null,
  liveTabCount: 0,
  liveLeafCount: 0
}

const liveEntry: RuntimeEnvironmentStatus = { status: liveStatus, checkedAt: Date.now() }
const offlineEntry: RuntimeEnvironmentStatus = { status: null, checkedAt: Date.now() }

function makeGroup(overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id: 'group-1',
    name: 'Platform',
    parentPath: null,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('resolveProjectGroupDeleteAction', () => {
  it('returns force-remove-locally when the active env is offline and the group belongs to it', () => {
    const group = makeGroup({ executionHostId: RUNTIME_HOST_ID })
    const statusMap = new Map<string, RuntimeEnvironmentStatus>([[ENV_ID, offlineEntry]])

    const result = resolveProjectGroupDeleteAction({
      group,
      settings: settingsWithEnv,
      runtimeStatusByEnvironmentId: statusMap
    })

    expect(result).toBe('force-remove-locally')
  })

  it('returns force-remove-locally when the status entry is absent (never probed)', () => {
    const group = makeGroup({ executionHostId: RUNTIME_HOST_ID })
    const statusMap = new Map<string, RuntimeEnvironmentStatus>()

    const result = resolveProjectGroupDeleteAction({
      group,
      settings: settingsWithEnv,
      runtimeStatusByEnvironmentId: statusMap
    })

    expect(result).toBe('force-remove-locally')
  })

  it('returns online-delete when the active env is offline but the group belongs to a different env', () => {
    // Why: env-abc123 is offline, but the group is owned by env-other — must not silently no-op.
    const group = makeGroup({ executionHostId: OTHER_RUNTIME_HOST_ID })
    const statusMap = new Map<string, RuntimeEnvironmentStatus>([[ENV_ID, offlineEntry]])

    const result = resolveProjectGroupDeleteAction({
      group,
      settings: settingsWithEnv,
      runtimeStatusByEnvironmentId: statusMap
    })

    expect(result).toBe('online-delete')
  })

  it('returns online-delete when the active env is offline but the group has no executionHostId (local group)', () => {
    const group = makeGroup({ executionHostId: undefined })
    const statusMap = new Map<string, RuntimeEnvironmentStatus>([[ENV_ID, offlineEntry]])

    const result = resolveProjectGroupDeleteAction({
      group,
      settings: settingsWithEnv,
      runtimeStatusByEnvironmentId: statusMap
    })

    expect(result).toBe('online-delete')
  })

  it('returns online-delete when the group belongs to the active env but the env is reachable', () => {
    const group = makeGroup({ executionHostId: RUNTIME_HOST_ID })
    const statusMap = new Map<string, RuntimeEnvironmentStatus>([[ENV_ID, liveEntry]])

    const result = resolveProjectGroupDeleteAction({
      group,
      settings: settingsWithEnv,
      runtimeStatusByEnvironmentId: statusMap
    })

    expect(result).toBe('online-delete')
  })

  it('returns online-delete when the active target is local (no runtime environment set)', () => {
    const group = makeGroup({ executionHostId: RUNTIME_HOST_ID })
    const statusMap = new Map<string, RuntimeEnvironmentStatus>()

    const result = resolveProjectGroupDeleteAction({
      group,
      settings: settingsLocal,
      runtimeStatusByEnvironmentId: statusMap
    })

    expect(result).toBe('online-delete')
  })

  it('returns online-delete when the group is undefined (e.g. race between dialog open and group removal)', () => {
    const statusMap = new Map<string, RuntimeEnvironmentStatus>([[ENV_ID, offlineEntry]])

    const result = resolveProjectGroupDeleteAction({
      group: undefined,
      settings: settingsWithEnv,
      runtimeStatusByEnvironmentId: statusMap
    })

    expect(result).toBe('online-delete')
  })
})
