import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type {
  FolderWorkspace,
  PendingProjectGroupDeletion,
  ProjectGroup,
  Repo
} from '../../../../shared/types'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'

// ── shared fixtures ────────────────────────────────────────────────────────

const remoteRepo: Repo = {
  id: 'remote-repo',
  path: '/remote',
  displayName: 'Remote',
  badgeColor: '#111',
  addedAt: 2
}

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
  // Owned by env-1 (set as executionHostId in tests)
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
const pendingAdd = vi.fn()
const pendingRemove = vi.fn()
const projectGroupsDelete = vi.fn()
const reposRemove = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

function setupWindow(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal('window', {
    api: {
      repos: { remove: reposRemove },
      projectGroups: { delete: projectGroupsDelete },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall },
      pendingProjectGroupDeletions: {
        list: pendingList,
        add: pendingAdd,
        remove: pendingRemove
      },
      ...overrides
    }
  })
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  reposRemove.mockReset()
  reposRemove.mockResolvedValue(undefined)
  projectGroupsDelete.mockReset()
  pendingList.mockReset()
  pendingList.mockResolvedValue([])
  pendingAdd.mockReset()
  pendingAdd.mockImplementation(async (args: Omit<PendingProjectGroupDeletion, 'createdAt'>) => ({
    ...args,
    createdAt: Date.now()
  }))
  pendingRemove.mockReset()
  pendingRemove.mockResolvedValue(true)
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  setupWindow()
})

// ── hydratePendingProjectGroupDeletions ───────────────────────────────────

describe('hydratePendingProjectGroupDeletions', () => {
  it('loads tombstones from the API and updates state', async () => {
    pendingList.mockResolvedValue([tombstone])
    const store = createTestStore()

    await store.getState().hydratePendingProjectGroupDeletions()

    expect(pendingList).toHaveBeenCalledOnce()
    expect(store.getState().pendingProjectGroupDeletions).toEqual([tombstone])
  })

  it('logs error but does not throw when the API rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    pendingList.mockRejectedValue(new Error('storage error'))
    const store = createTestStore()

    await expect(store.getState().hydratePendingProjectGroupDeletions()).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

// ── forceRemoveProjectGroupLocally ────────────────────────────────────────

describe('forceRemoveProjectGroupLocally', () => {
  it('writes tombstone via add and updates pendingProjectGroupDeletions state', async () => {
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      repos: []
    })

    const result = await store
      .getState()
      .forceRemoveProjectGroupLocally(projectGroup.id, { removeContainedProjects: false })

    expect(pendingAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentId: 'env-1',
        groupId: projectGroup.id,
        removeContainedProjects: false
      })
    )
    expect(result).toEqual({ environmentId: 'env-1', groupId: projectGroup.id })
    expect(store.getState().pendingProjectGroupDeletions).toHaveLength(1)
    expect(store.getState().pendingProjectGroupDeletions[0]).toMatchObject({
      environmentId: 'env-1',
      groupId: projectGroup.id
    })
  })

  it('immediately removes the group from projectGroups state', async () => {
    const siblingGroup: ProjectGroup = { ...projectGroup, id: 'sibling', tabOrder: 1 }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup, siblingGroup],
      repos: []
    })

    await store
      .getState()
      .forceRemoveProjectGroupLocally(projectGroup.id, { removeContainedProjects: false })

    expect(store.getState().projectGroups.map((g) => g.id)).toEqual([siblingGroup.id])
  })

  it('detaches repos from the group when removeContainedProjects is false', async () => {
    const groupedRepo: Repo = { ...remoteRepo, id: 'grouped', projectGroupId: projectGroup.id }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      repos: [groupedRepo]
    })

    await store
      .getState()
      .forceRemoveProjectGroupLocally(projectGroup.id, { removeContainedProjects: false })

    expect(store.getState().repos).toMatchObject([{ id: 'grouped', projectGroupId: null }])
    // pendingProjectIds must be empty for the detach case
    expect(pendingAdd).toHaveBeenCalledWith(expect.objectContaining({ pendingProjectIds: [] }))
  })

  it('records pendingProjectIds and hides repos when removeContainedProjects is true', async () => {
    const groupedRepo: Repo = { ...remoteRepo, id: 'grouped', projectGroupId: projectGroup.id }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      repos: [groupedRepo]
    })

    await store
      .getState()
      .forceRemoveProjectGroupLocally(projectGroup.id, { removeContainedProjects: true })

    // add called with the repo id in pendingProjectIds
    expect(pendingAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        removeContainedProjects: true,
        pendingProjectIds: ['grouped']
      })
    )
    // repo is removed from local state (hidden)
    expect(store.getState().repos.find((r) => r.id === 'grouped')).toBeUndefined()
  })

  it('removes folder workspaces belonging to the group subtree', async () => {
    const workspace: FolderWorkspace = {
      id: 'fw-1',
      projectGroupId: projectGroup.id,
      name: 'WS',
      folderPath: '/ws',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      createdAt: 1,
      updatedAt: 1
    }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      folderWorkspaces: [workspace],
      repos: []
    })

    await store
      .getState()
      .forceRemoveProjectGroupLocally(projectGroup.id, { removeContainedProjects: false })

    expect(store.getState().folderWorkspaces).toEqual([])
  })

  it('returns null for a local-target group (non-runtime owner)', async () => {
    const localGroup: ProjectGroup = {
      ...projectGroup,
      executionHostId: 'local'
    }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: null } as never,
      projectGroups: [localGroup],
      repos: []
    })

    const result = await store
      .getState()
      .forceRemoveProjectGroupLocally(localGroup.id, { removeContainedProjects: false })

    expect(result).toBeNull()
    expect(pendingAdd).not.toHaveBeenCalled()
  })

  it('returns null when group is not found', async () => {
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [],
      repos: []
    })

    const result = await store
      .getState()
      .forceRemoveProjectGroupLocally('nonexistent', { removeContainedProjects: false })

    expect(result).toBeNull()
    expect(pendingAdd).not.toHaveBeenCalled()
  })

  it('removes subtree child groups along with the root group', async () => {
    const childGroup: ProjectGroup = {
      ...projectGroup,
      id: 'child-1',
      parentGroupId: projectGroup.id,
      executionHostId: 'runtime:env-1'
    }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup, childGroup],
      repos: []
    })

    await store
      .getState()
      .forceRemoveProjectGroupLocally(projectGroup.id, { removeContainedProjects: false })

    expect(store.getState().projectGroups).toEqual([])
    // subtreeGroupIds should contain both root and child
    expect(pendingAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        subtreeGroupIds: expect.arrayContaining([projectGroup.id, 'child-1'])
      })
    )
  })
})

// ── fetch filtering (safety-net) ──────────────────────────────────────────

describe('fetch filtering with pending tombstones', () => {
  it('fetchProjectGroups filters out tombstoned groups returned by server', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-group-list',
      ok: true,
      result: { groups: [{ ...projectGroup, executionHostId: undefined }] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().fetchProjectGroups()

    expect(store.getState().projectGroups).toEqual([])
  })

  it('fetchRuntimeEnvironmentRepos filters / detaches repos for tombstoned groups', async () => {
    const groupedRepo: Repo = {
      ...remoteRepo,
      id: 'grouped',
      projectGroupId: projectGroup.id
    }
    // projectGroup.list returns the group; repo.list returns the grouped repo
    runtimeEnvironmentCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
      if (args.method === 'repo.list') {
        return Promise.resolve({
          id: 'rpc-repo-list',
          ok: true,
          result: { repos: [groupedRepo] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      if (args.method === 'project.list') {
        return Promise.resolve({
          id: 'rpc-project-list',
          ok: true,
          result: { projects: [] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      if (args.method === 'projectHostSetup.list') {
        return Promise.resolve({
          id: 'rpc-setup-list',
          ok: true,
          result: { setups: [] },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      return Promise.reject(new Error(`Unexpected method: ${args.method}`))
    })

    const tombstoneDetach: PendingProjectGroupDeletion = {
      ...tombstone,
      removeContainedProjects: false
    }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      pendingProjectGroupDeletions: [tombstoneDetach]
    } as never)

    await store.getState().fetchRuntimeEnvironmentRepos('env-1')

    const repoInState = store.getState().repos.find((r) => r.id === 'grouped')
    // detach case: repo present but projectGroupId is null
    expect(repoInState).toBeDefined()
    expect(repoInState?.projectGroupId).toBeNull()
  })

  it('fetchFolderWorkspaces filters out tombstoned group workspaces', async () => {
    const workspace: FolderWorkspace = {
      id: 'fw-2',
      projectGroupId: projectGroup.id,
      name: 'WS2',
      folderPath: '/ws2',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      createdAt: 1,
      updatedAt: 1
    }
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-fw-list',
      ok: true,
      result: { folderWorkspaces: [workspace] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().fetchFolderWorkspaces()

    expect(store.getState().folderWorkspaces).toEqual([])
  })
})

// ── replayPendingDeletionsForEnvironment ──────────────────────────────────

describe('replayPendingDeletionsForEnvironment', () => {
  it('calls projectGroup.delete and clears tombstone on success', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-group-delete',
      ok: true,
      result: { deleted: true },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().replayPendingDeletionsForEnvironment('env-1')

    const deleteCall = runtimeEnvironmentCall.mock.calls.find(
      (call) => call[0]?.method === 'projectGroup.delete'
    )
    expect(deleteCall).toBeDefined()
    expect(deleteCall![0]).toMatchObject({
      selector: 'env-1',
      method: 'projectGroup.delete',
      params: { groupId: projectGroup.id }
    })
    expect(pendingRemove).toHaveBeenCalledWith({
      environmentId: 'env-1',
      groupId: projectGroup.id
    })
    expect(store.getState().pendingProjectGroupDeletions).toEqual([])
  })

  it('clears tombstone even when projectGroup.delete returns { deleted: false } (idempotent)', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-group-delete',
      ok: true,
      result: { deleted: false },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().replayPendingDeletionsForEnvironment('env-1')

    expect(pendingRemove).toHaveBeenCalledWith({
      environmentId: 'env-1',
      groupId: projectGroup.id
    })
    expect(store.getState().pendingProjectGroupDeletions).toEqual([])
  })

  it('calls repo.rm for each pendingProjectId before deleting the group', async () => {
    const tombstoneWithRepos: PendingProjectGroupDeletion = {
      ...tombstone,
      removeContainedProjects: true,
      pendingProjectIds: ['repo-a', 'repo-b']
    }
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc',
      ok: true,
      result: {},
      _meta: { runtimeId: 'runtime-remote' }
    })
    // projectGroup.delete needs a { deleted } result
    runtimeEnvironmentCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
      if (args.method === 'projectGroup.delete') {
        return Promise.resolve({
          id: 'rpc-gd',
          ok: true,
          result: { deleted: true },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      return Promise.resolve({
        id: 'rpc-rm',
        ok: true,
        result: {},
        _meta: { runtimeId: 'runtime-remote' }
      })
    })
    const store = createTestStore()
    store.setState({
      pendingProjectGroupDeletions: [tombstoneWithRepos]
    } as never)

    await store.getState().replayPendingDeletionsForEnvironment('env-1')

    const repoRmCalls = runtimeEnvironmentCall.mock.calls.filter(
      (call) => call[0]?.method === 'repo.rm'
    )
    expect(repoRmCalls).toHaveLength(2)
    expect(repoRmCalls[0][0]).toMatchObject({ params: { repo: 'repo-a' } })
    expect(repoRmCalls[1][0]).toMatchObject({ params: { repo: 'repo-b' } })
    expect(pendingRemove).toHaveBeenCalledOnce()
    expect(store.getState().pendingProjectGroupDeletions).toEqual([])
  })

  it('treats repo_not_found as success and proceeds to delete the group', async () => {
    const tombstoneWithRepo: PendingProjectGroupDeletion = {
      ...tombstone,
      removeContainedProjects: true,
      pendingProjectIds: ['gone-repo']
    }
    runtimeEnvironmentCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
      if (args.method === 'repo.rm') {
        // Simulate repo_not_found RPC failure
        return Promise.resolve({
          id: 'rpc-rm',
          ok: false,
          error: { code: 'repo_not_found', message: 'repo_not_found' },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      if (args.method === 'projectGroup.delete') {
        return Promise.resolve({
          id: 'rpc-gd',
          ok: true,
          result: { deleted: true },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      return Promise.resolve({ id: 'rpc', ok: true, result: {}, _meta: { runtimeId: 'remote' } })
    })
    const store = createTestStore()
    store.setState({
      pendingProjectGroupDeletions: [tombstoneWithRepo]
    } as never)

    await store.getState().replayPendingDeletionsForEnvironment('env-1')

    // Should still call projectGroup.delete despite repo_not_found
    const deleteCalls = runtimeEnvironmentCall.mock.calls.filter(
      (call) => call[0]?.method === 'projectGroup.delete'
    )
    expect(deleteCalls).toHaveLength(1)
    expect(pendingRemove).toHaveBeenCalledOnce()
    expect(store.getState().pendingProjectGroupDeletions).toEqual([])
  })

  it('keeps tombstone and skips group delete when repo.rm fails with a transport error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const tombstoneWithRepo: PendingProjectGroupDeletion = {
      ...tombstone,
      removeContainedProjects: true,
      pendingProjectIds: ['unreachable-repo']
    }
    runtimeEnvironmentCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
      if (args.method === 'repo.rm') {
        return Promise.resolve({
          id: 'rpc-rm',
          ok: false,
          error: { code: 'runtime_error', message: 'network timeout' },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      return Promise.resolve({ id: 'rpc', ok: true, result: {}, _meta: { runtimeId: 'remote' } })
    })
    const store = createTestStore()
    store.setState({
      pendingProjectGroupDeletions: [tombstoneWithRepo]
    } as never)

    await store.getState().replayPendingDeletionsForEnvironment('env-1')

    // projectGroup.delete must NOT be called
    const deleteCalls = runtimeEnvironmentCall.mock.calls.filter(
      (call) => call[0]?.method === 'projectGroup.delete'
    )
    expect(deleteCalls).toHaveLength(0)
    expect(pendingRemove).not.toHaveBeenCalled()
    // Tombstone still present
    expect(store.getState().pendingProjectGroupDeletions).toHaveLength(1)
    consoleError.mockRestore()
  })

  it('keeps tombstone when projectGroup.delete RPC throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    runtimeEnvironmentCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
      if (args.method === 'projectGroup.delete') {
        return Promise.resolve({
          id: 'rpc-gd',
          ok: false,
          error: { code: 'runtime_error', message: 'server error' },
          _meta: { runtimeId: 'runtime-remote' }
        })
      }
      return Promise.resolve({ id: 'rpc', ok: true, result: {}, _meta: { runtimeId: 'remote' } })
    })
    const store = createTestStore()
    store.setState({
      pendingProjectGroupDeletions: [tombstone]
    } as never)

    await store.getState().replayPendingDeletionsForEnvironment('env-1')

    expect(pendingRemove).not.toHaveBeenCalled()
    expect(store.getState().pendingProjectGroupDeletions).toHaveLength(1)
    consoleError.mockRestore()
  })

  it('does nothing when there are no tombstones for the given environment', async () => {
    const store = createTestStore()
    store.setState({
      pendingProjectGroupDeletions: [tombstone] // env-1, but we replay env-2
    } as never)

    await store.getState().replayPendingDeletionsForEnvironment('env-2')

    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
    expect(pendingRemove).not.toHaveBeenCalled()
    expect(store.getState().pendingProjectGroupDeletions).toHaveLength(1)
  })
})
