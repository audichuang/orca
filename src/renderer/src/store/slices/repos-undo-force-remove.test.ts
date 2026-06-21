import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { PendingProjectGroupDeletion, ProjectGroup } from '../../../../shared/types'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'

// ── fixtures ──────────────────────────────────────────────────────────────

const projectGroup: ProjectGroup = {
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
  executionHostId: 'runtime:env-1'
}

const tombstone: PendingProjectGroupDeletion = {
  environmentId: 'env-1',
  groupId: projectGroup.id,
  removeContainedProjects: false,
  pendingProjectIds: [],
  subtreeGroupIds: [projectGroup.id],
  createdAt: 100
}

// ── mocks ─────────────────────────────────────────────────────────────────

const pendingList = vi.fn()
const pendingRemove = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

function setupWindow(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal('window', {
    api: {
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall },
      pendingProjectGroupDeletions: {
        list: pendingList,
        remove: pendingRemove
      },
      ...overrides
    }
  })
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  pendingList.mockReset()
  pendingList.mockResolvedValue([])
  pendingRemove.mockReset()
  pendingRemove.mockResolvedValue(true)
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  setupWindow()
})

// ── undoForceRemoveProjectGroup ───────────────────────────────────────────

describe('undoForceRemoveProjectGroup', () => {
  it('calls pendingProjectGroupDeletions.remove with environmentId and groupId', async () => {
    // Mock re-fetch calls to return empty results
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc',
      ok: true,
      result: { groups: [], repos: [], projects: [], setups: [], folderWorkspaces: [] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().undoForceRemoveProjectGroup('env-1', projectGroup.id)

    expect(pendingRemove).toHaveBeenCalledWith({
      environmentId: 'env-1',
      groupId: projectGroup.id
    })
  })

  it('removes the tombstone from pendingProjectGroupDeletions state', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc',
      ok: true,
      result: { groups: [], repos: [], projects: [], setups: [], folderWorkspaces: [] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().undoForceRemoveProjectGroup('env-1', projectGroup.id)

    expect(store.getState().pendingProjectGroupDeletions).toEqual([])
  })

  it('keeps tombstones for other environments intact after undo', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc',
      ok: true,
      result: { groups: [], repos: [], projects: [], setups: [], folderWorkspaces: [] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const otherTombstone: PendingProjectGroupDeletion = {
      environmentId: 'env-2',
      groupId: 'group-x',
      removeContainedProjects: false,
      pendingProjectIds: [],
      subtreeGroupIds: ['group-x'],
      createdAt: 200
    }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      pendingProjectGroupDeletions: [tombstone, otherTombstone]
    } as never)

    await store.getState().undoForceRemoveProjectGroup('env-1', projectGroup.id)

    expect(store.getState().pendingProjectGroupDeletions).toEqual([otherTombstone])
  })

  it('still clears state tombstone when the persistence remove call fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    pendingRemove.mockRejectedValue(new Error('storage error'))
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc',
      ok: true,
      result: { groups: [], repos: [], projects: [], setups: [], folderWorkspaces: [] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().undoForceRemoveProjectGroup('env-1', projectGroup.id)

    // Tombstone removed from state even though persistence failed
    expect(store.getState().pendingProjectGroupDeletions).toEqual([])
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('triggers fetchRuntimeEnvironmentRepos and fetchProjectGroups for refetch', async () => {
    // Return empty group list from projectGroup.list and repo list
    runtimeEnvironmentCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
      if (args.method === 'projectGroup.list') {
        return Promise.resolve({
          id: 'rpc-groups',
          ok: true,
          result: { groups: [] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      if (args.method === 'repo.list') {
        return Promise.resolve({
          id: 'rpc-repos',
          ok: true,
          result: { repos: [] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      if (args.method === 'project.list') {
        return Promise.resolve({
          id: 'rpc-projects',
          ok: true,
          result: { projects: [] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      if (args.method === 'projectHostSetup.list') {
        return Promise.resolve({
          id: 'rpc-setups',
          ok: true,
          result: { setups: [] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      if (args.method === 'folderWorkspace.list') {
        return Promise.resolve({
          id: 'rpc-fw',
          ok: true,
          result: { folderWorkspaces: [] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      return Promise.reject(new Error(`Unexpected method: ${args.method}`))
    })

    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().undoForceRemoveProjectGroup('env-1', projectGroup.id)

    // Verify at least a projectGroup.list call was made (from fetchProjectGroups)
    const groupListCalls = runtimeEnvironmentCall.mock.calls.filter(
      (call) => call[0]?.method === 'projectGroup.list'
    )
    expect(groupListCalls.length).toBeGreaterThanOrEqual(1)
  })
})
