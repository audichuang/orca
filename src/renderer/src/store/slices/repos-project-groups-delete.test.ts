import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore, makeWorktree, makeTab } from './store-test-helpers'
import type { FolderWorkspace, ProjectGroup, Repo } from '../../../../shared/types'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '../../runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '../../runtime/runtime-rpc-client'
import type { DeleteProjectGroupResult } from './repos'
import { purgeProjectLocalState } from './repos'

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
  updatedAt: 1
}

const reposRemove = vi.fn()
const projectGroupsDelete = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  reposRemove.mockReset()
  reposRemove.mockResolvedValue(undefined)
  projectGroupsDelete.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      repos: { remove: reposRemove },
      projectGroups: { delete: projectGroupsDelete },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

describe('project group deletion store routing', () => {
  it('removes local project group subtrees from renderer state after delete', async () => {
    const childGroup: ProjectGroup = {
      ...projectGroup,
      id: 'child',
      parentGroupId: projectGroup.id
    }
    const siblingGroup: ProjectGroup = {
      ...projectGroup,
      id: 'sibling',
      name: 'Tools',
      tabOrder: 1
    }
    const childWorkspace: FolderWorkspace = {
      id: 'folder-workspace-1',
      projectGroupId: childGroup.id,
      name: 'Shared cleanup',
      folderPath: '/workspace/platform/shared',
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 1,
      lastActivityAt: 0,
      createdAt: 1,
      updatedAt: 1
    }
    projectGroupsDelete.mockResolvedValue(true)
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup, childGroup, siblingGroup],
      folderWorkspaces: [childWorkspace],
      repos: [
        { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id },
        { ...remoteRepo, id: 'nested', projectGroupId: childGroup.id },
        { ...remoteRepo, id: 'sibling', projectGroupId: siblingGroup.id }
      ]
    })

    await expect(store.getState().deleteProjectGroup(projectGroup.id)).resolves.toEqual({
      ok: true
    })

    expect(store.getState().projectGroups.map((group) => group.id)).toEqual([siblingGroup.id])
    expect(store.getState().folderWorkspaces).toEqual([])
    expect(store.getState().repos).toMatchObject([
      { id: 'direct', projectGroupId: null },
      { id: 'nested', projectGroupId: null },
      { id: 'sibling', projectGroupId: siblingGroup.id }
    ])
  })

  it('uses the remote delete response shape before mutating local state', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-delete-group',
      ok: true,
      result: { deleted: false },
      _meta: { runtimeId: 'runtime-remote' }
    })
    const groupedRepo = { ...remoteRepo, projectGroupId: projectGroup.id }
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      repos: [groupedRepo]
    })

    await expect(store.getState().deleteProjectGroup(projectGroup.id)).resolves.toEqual({
      ok: false,
      reason: 'rejected'
    })

    expect(store.getState().projectGroups).toEqual([projectGroup])
    expect(store.getState().repos).toEqual([groupedRepo])
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'projectGroup.delete',
      params: { groupId: projectGroup.id },
      timeoutMs: 15_000
    })
    expect(projectGroupsDelete).not.toHaveBeenCalled()
  })

  it('deletes only the group when contained project removal is not requested', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const groupedRepo = { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id }
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup],
      repos: [groupedRepo]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: false
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: [],
      removedProjectIds: [],
      failedProjectRemovals: []
    })

    expect(reposRemove).not.toHaveBeenCalled()
    expect(store.getState().repos).toMatchObject([{ id: 'direct', projectGroupId: null }])
  })

  it('removes direct and nested child projects after deleting a group', async () => {
    const childGroup: ProjectGroup = {
      ...projectGroup,
      id: 'child',
      parentGroupId: projectGroup.id
    }
    const siblingRepo = { ...remoteRepo, id: 'sibling', projectGroupId: null }
    projectGroupsDelete.mockResolvedValue(true)
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup, childGroup],
      repos: [
        { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id },
        { ...remoteRepo, id: 'nested', projectGroupId: childGroup.id },
        siblingRepo
      ]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: ['direct', 'nested'],
      removedProjectIds: ['direct', 'nested'],
      failedProjectRemovals: []
    })

    expect(reposRemove).toHaveBeenCalledWith({ repoId: 'direct' })
    expect(reposRemove).toHaveBeenCalledWith({ repoId: 'nested' })
    expect(store.getState().repos).toEqual([siblingRepo])
  })

  it('does not remove contained projects when group deletion fails', async () => {
    projectGroupsDelete.mockResolvedValue(false)
    const groupedRepo = { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id }
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup],
      repos: [groupedRepo]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'group-delete-failed',
      groupId: projectGroup.id,
      requestedProjectIds: ['direct'],
      removedProjectIds: [],
      failedProjectRemovals: [],
      reason: 'rejected'
    })

    expect(reposRemove).not.toHaveBeenCalled()
    expect(store.getState().repos).toEqual([groupedRepo])
  })

  it('reports project removal failures by comparing store state after removeProject', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reposRemove.mockImplementation(async ({ repoId }: { repoId: string }) => {
      if (repoId === 'nested') {
        throw new Error('remove failed')
      }
    })
    const childGroup: ProjectGroup = {
      ...projectGroup,
      id: 'child',
      parentGroupId: projectGroup.id
    }
    projectGroupsDelete.mockResolvedValue(true)
    const store = createTestStore()
    store.setState({
      projectGroups: [projectGroup, childGroup],
      repos: [
        { ...remoteRepo, id: 'direct', projectGroupId: projectGroup.id },
        { ...remoteRepo, id: 'nested', projectGroupId: childGroup.id }
      ]
    })

    await expect(
      store.getState().deleteProjectGroupWithContainedProjects(projectGroup.id, {
        removeContainedProjects: true
      })
    ).resolves.toEqual({
      status: 'deleted-group',
      groupId: projectGroup.id,
      requestedProjectIds: ['direct', 'nested'],
      removedProjectIds: ['direct'],
      failedProjectRemovals: [
        {
          projectId: 'nested',
          reason: 'Project remained in Orca after removeProject completed.'
        }
      ]
    })

    expect(store.getState().repos.map((repo) => repo.id)).toEqual(['nested'])
    consoleError.mockRestore()
  })
})

describe('deleteProjectGroup typed result', () => {
  it('returns { ok: false, reason: "unreachable" } when RPC rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    runtimeEnvironmentCall.mockRejectedValue(new Error('network timeout'))
    const store = createTestStore()
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never,
      projectGroups: [projectGroup],
      repos: []
    })

    const result: DeleteProjectGroupResult = await store
      .getState()
      .deleteProjectGroup(projectGroup.id)
    expect(result).toEqual({ ok: false, reason: 'unreachable' })
    // State must remain unchanged on unreachable.
    expect(store.getState().projectGroups).toEqual([projectGroup])
    consoleError.mockRestore()
  })

  it('returns { ok: true } for a successful local delete', async () => {
    projectGroupsDelete.mockResolvedValue(true)
    const store = createTestStore()
    store.setState({ projectGroups: [projectGroup], repos: [] })

    const result: DeleteProjectGroupResult = await store
      .getState()
      .deleteProjectGroup(projectGroup.id)
    expect(result).toEqual({ ok: true })
    expect(store.getState().projectGroups).toEqual([])
  })
})

describe('purgeProjectLocalState stopRemoteTerminals flag', () => {
  const remoteRepo2: Repo = {
    id: 'env-repo',
    path: '/remote-path',
    displayName: 'EnvRepo',
    badgeColor: '#222',
    addedAt: 3
  }
  const ptyKill = vi.fn()

  beforeEach(() => {
    ptyKill.mockReset()
    vi.stubGlobal('window', {
      api: {
        repos: { remove: reposRemove },
        projectGroups: { delete: projectGroupsDelete },
        runtimeEnvironments: { call: runtimeEnvironmentTransportCall },
        pty: { kill: ptyKill }
      }
    })
  })

  it('calls terminal.stop RPC when removeProject runs (stopRemoteTerminals: true path)', async () => {
    // Why: removeProject must call terminal.stop for environment-hosted repos
    // so remote PTYs are cleaned up. This verifies the true branch is preserved.
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-rm',
      ok: true,
      result: {},
      _meta: { runtimeId: 'runtime-remote' }
    })
    const store = createTestStore()
    const worktreeId = `${remoteRepo2.id}::/remote-path/wt`
    const tab = makeTab({ id: 'tab-env-1', worktreeId })
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-2' } as never,
      repos: [{ ...remoteRepo2, projectGroupId: null }],
      worktreesByRepo: {
        [remoteRepo2.id]: [makeWorktree({ id: worktreeId, repoId: remoteRepo2.id })]
      },
      tabsByWorktree: {
        [worktreeId]: [tab]
      },
      ptyIdsByTabId: {
        'tab-env-1': ['remote:pty-env-1']
      }
    } as never)

    await store.getState().removeProject(remoteRepo2.id)

    // terminal.stop must be called at least once — one call per worktree
    const terminalStopCalls = runtimeEnvironmentCall.mock.calls.filter(
      (call) => call[0]?.method === 'terminal.stop'
    )
    expect(terminalStopCalls.length).toBeGreaterThan(0)
    expect(terminalStopCalls[0][0]).toMatchObject({
      selector: 'env-2',
      method: 'terminal.stop',
      params: { worktree: `id:${worktreeId}` }
    })
    // repo.rm was called
    const repoRmCalls = runtimeEnvironmentCall.mock.calls.filter(
      (call) => call[0]?.method === 'repo.rm'
    )
    expect(repoRmCalls.length).toBe(1)
  })

  it('does not call terminal.stop RPC but clears local state when stopRemoteTerminals is false', async () => {
    // Why: the offline force-remove path skips terminal.stop RPCs (unreachable
    // runtime), but must still evict all worktree / tab / pty state locally.
    const store = createTestStore()
    const worktreeId = `${remoteRepo2.id}::/remote-path/wt2`
    const tab = makeTab({ id: 'tab-env-2', worktreeId })
    store.setState({
      settings: { activeRuntimeEnvironmentId: 'env-2' } as never,
      repos: [{ ...remoteRepo2, projectGroupId: null }],
      worktreesByRepo: {
        [remoteRepo2.id]: [makeWorktree({ id: worktreeId, repoId: remoteRepo2.id })]
      },
      tabsByWorktree: {
        [worktreeId]: [tab]
      },
      ptyIdsByTabId: {
        'tab-env-2': ['pty-local-2']
      }
    } as never)

    // Why: store.getState/setState satisfy purgeProjectLocalState's get/set signatures directly.
    const get = store.getState
    const set = store.setState

    await purgeProjectLocalState(get, set as never, remoteRepo2.id, {
      stopRemoteTerminals: false
    })

    // terminal.stop must NOT have been called
    const terminalStopCalls = runtimeEnvironmentCall.mock.calls.filter(
      (call) => call[0]?.method === 'terminal.stop'
    )
    expect(terminalStopCalls.length).toBe(0)

    // Local state must be cleared
    expect(store.getState().worktreesByRepo[remoteRepo2.id]).toBeUndefined()
    expect(store.getState().tabsByWorktree[worktreeId]).toBeUndefined()
    expect(store.getState().ptyIdsByTabId['tab-env-2']).toBeUndefined()
  })
})
