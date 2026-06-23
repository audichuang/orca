import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { FolderWorkspace, ProjectGroup, Repo } from '../../../../shared/types'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'

const projectGroupsList = vi.fn()
const folderWorkspacesList = vi.fn()
const reposList = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

function group(overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id: 'group-1',
    name: 'Project group',
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

function folderWorkspace(overrides: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'folder-1',
    projectGroupId: 'group-1',
    name: 'Folder workspace',
    folderPath: '/workspace/project',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 1,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/workspace/project',
    displayName: 'Project',
    badgeColor: '#000',
    addedAt: 1,
    ...overrides
  }
}

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  projectGroupsList.mockReset()
  folderWorkspacesList.mockReset()
  reposList.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      repos: { list: reposList },
      projectGroups: { list: projectGroupsList },
      folderWorkspaces: { list: folderWorkspacesList },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

describe('project model host refresh', () => {
  it('routes repo fetches through explicit local host while a runtime host is active', async () => {
    const localRepo = repo({
      id: 'local-repo',
      displayName: 'Local project',
      path: '/workspace/local'
    })
    const runtimeRepo = repo({
      id: 'runtime-repo',
      displayName: 'Runtime project',
      path: '/srv/runtime',
      executionHostId: 'runtime:env-1'
    })
    reposList.mockResolvedValue([localRepo])
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      repos: [runtimeRepo]
    })

    await store.getState().fetchRepos({ runtimeEnvironmentId: null })

    expect(reposList).toHaveBeenCalled()
    expect(runtimeEnvironmentCall).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'repo.list' })
    )
    expect(store.getState().repos).toEqual([
      runtimeRepo,
      { ...localRepo, executionHostId: 'local' }
    ])
  })

  it('routes project group fetches through an explicit runtime environment', async () => {
    const runtimeGroup = group({
      id: 'runtime-group',
      name: 'Ubuntu VM'
    })
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-list-groups',
      ok: true,
      result: { groups: [runtimeGroup] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({ settings: { activeRuntimeEnvironmentId: null } as never })

    await store.getState().fetchProjectGroups({ runtimeEnvironmentId: 'env-1' })

    expect(store.getState().projectGroups).toEqual([
      { ...runtimeGroup, executionHostId: 'runtime:env-1' }
    ])
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'projectGroup.list',
      params: undefined,
      timeoutMs: 15_000
    })
    expect(projectGroupsList).not.toHaveBeenCalled()
  })

  it('routes folder workspace fetches through an explicit runtime environment', async () => {
    const runtimeGroup = group({
      id: 'runtime-group',
      name: 'Ubuntu VM',
      executionHostId: 'runtime:env-1'
    })
    const runtimeWorkspace = folderWorkspace({
      id: 'runtime-folder',
      projectGroupId: runtimeGroup.id,
      name: 'Ubuntu VM folder',
      folderPath: '/srv/runtime'
    })
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-list-workspaces',
      ok: true,
      result: { folderWorkspaces: [runtimeWorkspace] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: null } as never,
      projectGroups: [runtimeGroup]
    })

    await store.getState().fetchFolderWorkspaces({ runtimeEnvironmentId: 'env-1' })

    expect(store.getState().folderWorkspaces).toEqual([runtimeWorkspace])
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'folderWorkspace.list',
      params: undefined,
      timeoutMs: 15_000
    })
    expect(folderWorkspacesList).not.toHaveBeenCalled()
  })

  it('preserves runtime project groups when refreshing local project groups', async () => {
    const localGroup = group({
      id: 'local-group',
      name: 'Local',
      executionHostId: 'local'
    })
    const runtimeGroup = group({
      id: 'runtime-group',
      name: 'Ubuntu VM',
      executionHostId: 'runtime:env-1'
    })
    projectGroupsList.mockResolvedValue([localGroup])
    const store = createTestStore()
    store.setState({ projectGroups: [runtimeGroup] })

    await store.getState().fetchProjectGroups()

    expect(store.getState().projectGroups).toEqual([runtimeGroup, localGroup])
  })

  it('preserves local and other-runtime project groups when refreshing one runtime host', async () => {
    const localGroup = group({
      id: 'local-group',
      name: 'Local',
      executionHostId: 'local'
    })
    const otherRuntimeGroup = group({
      id: 'other-runtime-group',
      name: 'Other remote',
      executionHostId: 'runtime:env-2'
    })
    const runtimeGroup = group({
      id: 'runtime-group',
      name: 'Ubuntu VM'
    })
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-list-groups',
      ok: true,
      result: { groups: [runtimeGroup] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [localGroup, otherRuntimeGroup]
    })

    await store.getState().fetchProjectGroups()

    expect(store.getState().projectGroups).toEqual([
      localGroup,
      otherRuntimeGroup,
      { ...runtimeGroup, executionHostId: 'runtime:env-1' }
    ])
  })

  it('preserves runtime folder workspaces when refreshing local folder workspaces', async () => {
    const localGroup = group({
      id: 'local-group',
      name: 'Local',
      executionHostId: 'local'
    })
    const runtimeGroup = group({
      id: 'runtime-group',
      name: 'Ubuntu VM',
      executionHostId: 'runtime:env-1'
    })
    const localWorkspace = folderWorkspace({
      id: 'local-folder',
      projectGroupId: localGroup.id,
      name: 'Local folder',
      folderPath: '/workspace/local'
    })
    const runtimeWorkspace = folderWorkspace({
      id: 'runtime-folder',
      projectGroupId: runtimeGroup.id,
      name: 'Ubuntu VM folder',
      folderPath: '/srv/runtime'
    })
    folderWorkspacesList.mockResolvedValue([localWorkspace])
    const store = createTestStore()
    store.setState({
      projectGroups: [localGroup, runtimeGroup],
      folderWorkspaces: [runtimeWorkspace]
    })

    await store.getState().fetchFolderWorkspaces()

    expect(store.getState().folderWorkspaces).toEqual([runtimeWorkspace, localWorkspace])
  })

  it('preserves local and other-runtime folder workspaces when refreshing one runtime host', async () => {
    const localGroup = group({
      id: 'local-group',
      name: 'Local',
      executionHostId: 'local'
    })
    const runtimeGroup = group({
      id: 'runtime-group',
      name: 'Ubuntu VM',
      executionHostId: 'runtime:env-1'
    })
    const otherRuntimeGroup = group({
      id: 'other-runtime-group',
      name: 'Other remote',
      executionHostId: 'runtime:env-2'
    })
    const localWorkspace = folderWorkspace({
      id: 'local-folder',
      projectGroupId: localGroup.id,
      name: 'Local folder',
      folderPath: '/workspace/local'
    })
    const runtimeWorkspace = folderWorkspace({
      id: 'runtime-folder',
      projectGroupId: runtimeGroup.id,
      name: 'Ubuntu VM folder',
      folderPath: '/srv/runtime'
    })
    const otherRuntimeWorkspace = folderWorkspace({
      id: 'other-runtime-folder',
      projectGroupId: otherRuntimeGroup.id,
      name: 'Other remote folder',
      folderPath: '/srv/other-runtime'
    })
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-list-workspaces',
      ok: true,
      result: { folderWorkspaces: [runtimeWorkspace] },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [localGroup, runtimeGroup, otherRuntimeGroup],
      folderWorkspaces: [localWorkspace, otherRuntimeWorkspace]
    })

    await store.getState().fetchFolderWorkspaces()

    expect(store.getState().folderWorkspaces).toEqual([
      localWorkspace,
      otherRuntimeWorkspace,
      runtimeWorkspace
    ])
  })
})
