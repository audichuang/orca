import { describe, expect, it, vi } from 'vitest'
import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import {
  hydrateStartupProjectModelHosts,
  replayThenRefreshRuntimeEnvironment
} from './runtime-environment-project-refresh'

// Why: B1/B2/B3 hinge on ONE shared primitive enforcing the exact order
// replay → groups → repos → workspaces → worktrees/lineage, fetching repos
// exactly once and only after groups (so the live subtree recompute can see
// the freshly-fetched groups). Project model fetches must be env-scoped, not
// active-host-scoped, or connected non-active servers stay invisible in Projects
// until a user opens Add Project and selects that host.
function makeStore(overrides: Partial<AppState> = {}): {
  store: Pick<StoreApi<AppState>, 'getState'>
  calls: string[]
  mocks: Record<string, ReturnType<typeof vi.fn>>
} {
  const calls: string[] = []
  const track =
    (name: string, result?: unknown) =>
    (...args: unknown[]) => {
      calls.push(name)
      void args
      return Promise.resolve(result)
    }

  const fetchRuntimeEnvironmentRepos = vi.fn(track('repos', [{ id: 'repo-1' }]))
  const fetchRepos = vi.fn(track('local-repos'))
  const fetchProjectGroups = vi.fn(track('groups'))
  const fetchFolderWorkspaces = vi.fn(track('workspaces'))
  const replayPendingDeletionsForEnvironment = vi.fn(track('replay'))
  const fetchWorktrees = vi.fn(track('worktrees', true))
  const refreshWorktreeLineageForRuntimeEnvironment = vi.fn(track('lineage'))
  const fetchWorktreeLineage = vi.fn(track('bare-lineage'))
  const hydrateRuntimeEnvironmentStatuses = vi.fn(track('statuses'))

  const state = {
    fetchRepos,
    fetchRuntimeEnvironmentRepos,
    fetchProjectGroups,
    fetchFolderWorkspaces,
    replayPendingDeletionsForEnvironment,
    fetchWorktrees,
    refreshWorktreeLineageForRuntimeEnvironment,
    fetchWorktreeLineage,
    hydrateRuntimeEnvironmentStatuses,
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    worktreesByRepo: {
      'repo-1': [{ id: 'repo-1::/workspace/main', repoId: 'repo-1' }]
    },
    // Default: env-1 is the active runtime target so the active-scoped
    // groups/workspaces fetches run (switch / reconnect-of-active case).
    settings: { activeRuntimeEnvironmentId: 'env-1' },
    ...overrides
  } as unknown as AppState

  return {
    store: { getState: () => state },
    calls,
    mocks: {
      fetchRuntimeEnvironmentRepos,
      fetchRepos,
      fetchProjectGroups,
      fetchFolderWorkspaces,
      replayPendingDeletionsForEnvironment,
      fetchWorktrees,
      refreshWorktreeLineageForRuntimeEnvironment,
      fetchWorktreeLineage,
      hydrateRuntimeEnvironmentStatuses
    }
  }
}

describe('replayThenRefreshRuntimeEnvironment', () => {
  it('runs replay → groups → repos → workspaces → worktrees → lineage in order when active', async () => {
    const { store, calls, mocks } = makeStore()

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(calls).toEqual(['replay', 'groups', 'repos', 'workspaces', 'worktrees', 'lineage'])
    expect(mocks.replayPendingDeletionsForEnvironment).toHaveBeenCalledWith('env-1')
  })

  it('fetches repos exactly once and only after groups when active', async () => {
    const { store, mocks } = makeStore()

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenCalledTimes(1)
    const groupsOrder = mocks.fetchProjectGroups.mock.invocationCallOrder[0]
    const reposOrder = mocks.fetchRuntimeEnvironmentRepos.mock.invocationCallOrder[0]
    expect(groupsOrder).toBeLessThan(reposOrder!)
  })

  it('forwards the background option to repos/worktrees/lineage fetches', async () => {
    const { store, mocks } = makeStore()

    await replayThenRefreshRuntimeEnvironment(store, 'env-1', { background: true })

    expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenCalledWith('env-1', { background: true })
    expect(mocks.fetchWorktrees).toHaveBeenCalledWith('repo-1', {
      skipLineageRefresh: true,
      background: true
    })
    expect(mocks.refreshWorktreeLineageForRuntimeEnvironment).toHaveBeenCalledWith('env-1', {
      background: true
    })
  })

  it('never invokes the cross-host bare lineage fetch', async () => {
    const { store, mocks } = makeStore()

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(mocks.fetchWorktreeLineage).not.toHaveBeenCalled()
  })

  it('treats authoritative empty worktree rows as hydrated', async () => {
    const { store } = makeStore({
      worktreesByRepo: {}
    } as never)

    const result = await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(result.worktreesHydrated).toBe(true)
  })

  it('still issues exactly one env-scoped lineage fetch when the env has zero repos', async () => {
    const { store, mocks } = makeStore({
      fetchRuntimeEnvironmentRepos: vi.fn(async () => [])
    } as never)

    const result = await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(mocks.fetchWorktrees).not.toHaveBeenCalled()
    expect(mocks.refreshWorktreeLineageForRuntimeEnvironment).toHaveBeenCalledExactlyOnceWith(
      'env-1',
      { background: undefined }
    )
    expect(result.worktreesHydrated).toBe(true)
  })

  it('fetches project groups/workspaces for a connected env even when it is not active', async () => {
    // Why: connected non-active servers should still hydrate their Projects
    // model. Otherwise the host looks connected but its projects do not appear
    // until Add Project temporarily focuses that host.
    const { store, calls, mocks } = makeStore({
      settings: { activeRuntimeEnvironmentId: 'env-active' }
    } as never)

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(calls).toEqual(['replay', 'groups', 'repos', 'workspaces', 'worktrees', 'lineage'])
    expect(mocks.replayPendingDeletionsForEnvironment).toHaveBeenCalledWith('env-1')
    expect(mocks.fetchProjectGroups).toHaveBeenCalledWith({ runtimeEnvironmentId: 'env-1' })
    expect(mocks.fetchFolderWorkspaces).toHaveBeenCalledWith({ runtimeEnvironmentId: 'env-1' })
    expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenCalledTimes(1)
  })

  it('fetches project groups/workspaces for a connected env while local is active', async () => {
    // Why: a local active target means the active-host route would fetch local
    // groups, so reconnect/startup must explicitly route through env-1.
    const { store, calls, mocks } = makeStore({
      settings: { activeRuntimeEnvironmentId: null }
    } as never)

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(calls).toEqual(['replay', 'groups', 'repos', 'workspaces', 'worktrees', 'lineage'])
    expect(mocks.fetchProjectGroups).toHaveBeenCalledWith({ runtimeEnvironmentId: 'env-1' })
    expect(mocks.fetchFolderWorkspaces).toHaveBeenCalledWith({ runtimeEnvironmentId: 'env-1' })
  })
})

describe('hydrateStartupProjectModelHosts', () => {
  it('hydrates local projects even when the active runtime target is remote', async () => {
    const { store, calls, mocks } = makeStore({
      settings: { activeRuntimeEnvironmentId: 'env-active' }
    } as never)

    await hydrateStartupProjectModelHosts(store)

    expect(calls).toEqual(['groups', 'local-repos', 'workspaces', 'statuses'])
    expect(mocks.fetchProjectGroups).toHaveBeenNthCalledWith(1, { runtimeEnvironmentId: null })
    expect(mocks.fetchRepos).toHaveBeenCalledWith({ runtimeEnvironmentId: null })
    expect(mocks.fetchFolderWorkspaces).toHaveBeenNthCalledWith(1, {
      runtimeEnvironmentId: null
    })
  })

  it('hydrates each connected runtime project model after status hydration', async () => {
    const runtimeStatus = { runtimeId: 'runtime-1' }
    const { store, calls, mocks } = makeStore({
      runtimeEnvironments: [
        { id: 'env-1', name: 'Ubuntu VM' },
        { id: 'env-2', name: 'Offline Box' }
      ],
      runtimeStatusByEnvironmentId: new Map([
        ['env-1', { status: runtimeStatus }],
        ['env-2', { status: null }]
      ])
    } as never)

    await hydrateStartupProjectModelHosts(store, { background: true })

    expect(calls).toEqual([
      'groups',
      'local-repos',
      'workspaces',
      'statuses',
      'replay',
      'groups',
      'repos',
      'workspaces',
      'worktrees',
      'lineage'
    ])
    expect(mocks.replayPendingDeletionsForEnvironment).toHaveBeenCalledExactlyOnceWith('env-1')
    expect(mocks.fetchProjectGroups).toHaveBeenNthCalledWith(2, {
      runtimeEnvironmentId: 'env-1'
    })
    expect(mocks.fetchFolderWorkspaces).toHaveBeenNthCalledWith(2, {
      runtimeEnvironmentId: 'env-1'
    })
    expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenCalledWith('env-1', {
      background: true
    })
    expect(mocks.fetchRuntimeEnvironmentRepos).not.toHaveBeenCalledWith('env-2', expect.anything())
  })

  it('continues startup hydration when one connected runtime refresh fails', async () => {
    const calls: string[] = []
    const { store, mocks } = makeStore({
      runtimeEnvironments: [
        { id: 'env-1', name: 'Broken Box' },
        { id: 'env-2', name: 'Healthy Box' }
      ],
      runtimeStatusByEnvironmentId: new Map([
        ['env-1', { status: { runtimeId: 'runtime-1' } }],
        ['env-2', { status: { runtimeId: 'runtime-2' } }]
      ]),
      replayPendingDeletionsForEnvironment: vi.fn(async (environmentId: string) => {
        calls.push(`replay:${environmentId}`)
        if (environmentId === 'env-1') {
          throw new Error('offline')
        }
      })
    } as never)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await hydrateStartupProjectModelHosts(store)
    } finally {
      consoleError.mockRestore()
    }

    expect(calls).toEqual(['replay:env-1', 'replay:env-2'])
    expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenCalledExactlyOnceWith('env-2', {
      background: undefined
    })
  })

  it('retries connected runtime hydration when startup worktree scans are not authoritative', async () => {
    vi.useFakeTimers()
    const { store, mocks } = makeStore({
      runtimeEnvironments: [{ id: 'env-1', name: 'Ubuntu VM' }],
      runtimeStatusByEnvironmentId: new Map([['env-1', { status: { runtimeId: 'runtime-1' } }]])
    } as never)
    mocks.fetchWorktrees.mockImplementation(async () => {
      return mocks.fetchWorktrees.mock.calls.length >= 2
    })

    try {
      await hydrateStartupProjectModelHosts(store)
      expect(mocks.fetchWorktrees).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(750)

      expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenCalledTimes(2)
      expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenLastCalledWith('env-1', {
        background: true
      })
      expect(mocks.fetchWorktrees).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
