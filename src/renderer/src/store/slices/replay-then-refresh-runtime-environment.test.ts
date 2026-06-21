import { describe, expect, it, vi } from 'vitest'
import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import { replayThenRefreshRuntimeEnvironment } from './runtime-environment-project-refresh'

// Why: B1/B2/B3 hinge on ONE shared primitive enforcing the exact order
// replay → groups → repos → workspaces → worktrees/lineage, fetching repos
// exactly once and only after groups (so the live subtree recompute can see
// the freshly-fetched groups). The active-scoped fetchProjectGroups/
// fetchFolderWorkspaces (B3-Connect) run ONLY when the refreshed env is the
// active runtime target; a Connect of a non-active env replays + refreshes its
// own repos/worktrees/lineage but must not re-fetch the active env's groups.
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
  const fetchProjectGroups = vi.fn(track('groups'))
  const fetchFolderWorkspaces = vi.fn(track('workspaces'))
  const replayPendingDeletionsForEnvironment = vi.fn(track('replay'))
  const fetchWorktrees = vi.fn(track('worktrees', true))
  const refreshWorktreeLineageForRuntimeEnvironment = vi.fn(track('lineage'))
  const fetchWorktreeLineage = vi.fn(track('bare-lineage'))

  const state = {
    fetchRuntimeEnvironmentRepos,
    fetchProjectGroups,
    fetchFolderWorkspaces,
    replayPendingDeletionsForEnvironment,
    fetchWorktrees,
    refreshWorktreeLineageForRuntimeEnvironment,
    fetchWorktreeLineage,
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
      fetchProjectGroups,
      fetchFolderWorkspaces,
      replayPendingDeletionsForEnvironment,
      fetchWorktrees,
      refreshWorktreeLineageForRuntimeEnvironment,
      fetchWorktreeLineage
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

  it('still issues exactly one env-scoped lineage fetch when the env has zero repos', async () => {
    const { store, mocks } = makeStore({
      fetchRuntimeEnvironmentRepos: vi.fn(async () => [])
    } as never)

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(mocks.fetchWorktrees).not.toHaveBeenCalled()
    expect(mocks.refreshWorktreeLineageForRuntimeEnvironment).toHaveBeenCalledExactlyOnceWith(
      'env-1',
      { background: undefined }
    )
  })

  it('skips the active-scoped groups/workspaces fetches when the env is NOT active (Connect)', async () => {
    // Why (B3-Connect): Connect of a non-active env must replay + refresh only
    // its own repos/worktrees/lineage. fetchProjectGroups/fetchFolderWorkspaces
    // read the ACTIVE runtime target, so running them here would re-fetch the
    // wrong host's groups/workspaces — the old refresh never did this.
    const { store, calls, mocks } = makeStore({
      settings: { activeRuntimeEnvironmentId: 'env-active' }
    } as never)

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(calls).toEqual(['replay', 'repos', 'worktrees', 'lineage'])
    expect(mocks.replayPendingDeletionsForEnvironment).toHaveBeenCalledWith('env-1')
    expect(mocks.fetchProjectGroups).not.toHaveBeenCalled()
    expect(mocks.fetchFolderWorkspaces).not.toHaveBeenCalled()
    expect(mocks.fetchRuntimeEnvironmentRepos).toHaveBeenCalledTimes(1)
  })

  it('skips the active-scoped fetches when the active target is local', async () => {
    // Why (B3-Connect): a local active target means no env is active; Connect of
    // a saved env must not fetch local groups/workspaces.
    const { store, calls, mocks } = makeStore({
      settings: { activeRuntimeEnvironmentId: null }
    } as never)

    await replayThenRefreshRuntimeEnvironment(store, 'env-1')

    expect(calls).toEqual(['replay', 'repos', 'worktrees', 'lineage'])
    expect(mocks.fetchProjectGroups).not.toHaveBeenCalled()
    expect(mocks.fetchFolderWorkspaces).not.toHaveBeenCalled()
  })
})
