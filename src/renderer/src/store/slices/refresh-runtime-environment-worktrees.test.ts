import { describe, expect, it, vi } from 'vitest'
import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import { refreshRuntimeEnvironmentWorktrees } from './runtime-environment-project-refresh'

function makeStore(repos: { id: string; executionHostId: string }[]) {
  const fetchWorktrees = vi.fn().mockResolvedValue(true)
  const refreshWorktreeLineageForRuntimeEnvironment = vi.fn().mockResolvedValue(undefined)
  const fetchRuntimeEnvironmentRepos = vi.fn().mockResolvedValue([])
  const replayPendingDeletionsForEnvironment = vi.fn().mockResolvedValue(undefined)
  const fetchProjectGroups = vi.fn().mockResolvedValue(undefined)
  const fetchFolderWorkspaces = vi.fn().mockResolvedValue(undefined)
  const state = {
    repos,
    worktreesByRepo: {},
    fetchWorktrees,
    refreshWorktreeLineageForRuntimeEnvironment,
    fetchRuntimeEnvironmentRepos,
    replayPendingDeletionsForEnvironment,
    fetchProjectGroups,
    fetchFolderWorkspaces
  } as unknown as AppState
  const store = { getState: () => state } as Pick<StoreApi<AppState>, 'getState'>
  return {
    store,
    fetchWorktrees,
    refreshWorktreeLineageForRuntimeEnvironment,
    fetchRuntimeEnvironmentRepos,
    replayPendingDeletionsForEnvironment,
    fetchProjectGroups,
    fetchFolderWorkspaces
  }
}

const runtimeRepo = (id: string, env: string) => ({ id, executionHostId: `runtime:${env}` })

describe('refreshRuntimeEnvironmentWorktrees', () => {
  it('fetches worktrees only for the target env repos and scopes lineage to that env', async () => {
    const h = makeStore([runtimeRepo('repo-a', 'env-1'), runtimeRepo('repo-b', 'env-2')])
    await refreshRuntimeEnvironmentWorktrees(h.store, 'env-1')
    expect(h.fetchWorktrees).toHaveBeenCalledTimes(1)
    expect(h.fetchWorktrees).toHaveBeenCalledWith(
      'repo-a',
      expect.objectContaining({ skipLineageRefresh: true })
    )
    expect(h.refreshWorktreeLineageForRuntimeEnvironment).toHaveBeenCalledWith('env-1', {
      background: undefined
    })
  })

  it('does not replay tombstones, refetch repos, fetch project groups, or fetch folder workspaces', async () => {
    const h = makeStore([runtimeRepo('repo-a', 'env-1')])
    await refreshRuntimeEnvironmentWorktrees(h.store, 'env-1')
    expect(h.replayPendingDeletionsForEnvironment).not.toHaveBeenCalled()
    expect(h.fetchRuntimeEnvironmentRepos).not.toHaveBeenCalled()
    expect(h.fetchProjectGroups).not.toHaveBeenCalled()
    expect(h.fetchFolderWorkspaces).not.toHaveBeenCalled()
  })

  it('forwards background:true to the underlying fetches', async () => {
    const h = makeStore([runtimeRepo('repo-a', 'env-1')])
    await refreshRuntimeEnvironmentWorktrees(h.store, 'env-1', { background: true })
    expect(h.fetchWorktrees).toHaveBeenCalledWith(
      'repo-a',
      expect.objectContaining({ skipLineageRefresh: true, background: true })
    )
    expect(h.refreshWorktreeLineageForRuntimeEnvironment).toHaveBeenCalledWith('env-1', {
      background: true
    })
  })

  it('swallows refresh errors so a bare void dispatch cannot reject', async () => {
    const h = makeStore([runtimeRepo('repo-a', 'env-1')])
    h.fetchWorktrees.mockRejectedValueOnce(new Error('boom'))
    await expect(refreshRuntimeEnvironmentWorktrees(h.store, 'env-1')).resolves.toBeUndefined()
  })
})
