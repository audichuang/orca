import { describe, expect, it, vi } from 'vitest'
import type { StoreApi } from 'zustand'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/types'
import { refreshRuntimeEnvironmentProjects } from './runtime-environment-project-refresh'

function makeRepo(id: string): Repo {
  return {
    id,
    path: `/remote/${id}`,
    displayName: id,
    badgeColor: '#000',
    addedAt: 0,
    executionHostId: 'runtime:env-1'
  } as Repo
}

function createMockStore(repos: Repo[]) {
  const calls: string[] = []
  const fetchRuntimeEnvironmentRepos = vi.fn(async (envId: string) => {
    calls.push(`repos:${envId}`)
    return repos
  })
  const fetchWorktrees = vi.fn(
    async (repoId: string, options?: { skipLineageRefresh?: boolean }) => {
      calls.push(`worktrees:${repoId}:${options?.skipLineageRefresh === true}`)
      return true
    }
  )
  const refreshWorktreeLineageForRuntimeEnvironment = vi.fn(async (envId: string | null) => {
    calls.push(`lineage:${envId}`)
  })
  const state = {
    fetchRuntimeEnvironmentRepos,
    fetchWorktrees,
    refreshWorktreeLineageForRuntimeEnvironment
  } as unknown as AppState
  const store: Pick<StoreApi<AppState>, 'getState'> = { getState: () => state }
  return {
    store,
    calls,
    fetchRuntimeEnvironmentRepos,
    fetchWorktrees,
    refreshWorktreeLineageForRuntimeEnvironment
  }
}

describe('refreshRuntimeEnvironmentProjects', () => {
  it('fetches repos, suppresses per-repo lineage, then fetches lineage once for the env', async () => {
    const {
      store,
      calls,
      fetchRuntimeEnvironmentRepos,
      fetchWorktrees,
      refreshWorktreeLineageForRuntimeEnvironment
    } = createMockStore([makeRepo('repo1'), makeRepo('repo2')])

    await refreshRuntimeEnvironmentProjects(store, 'env-1')

    expect(fetchRuntimeEnvironmentRepos).toHaveBeenCalledExactlyOnceWith('env-1')
    expect(fetchWorktrees).toHaveBeenCalledTimes(2)
    expect(fetchWorktrees).toHaveBeenCalledWith('repo1', { skipLineageRefresh: true })
    expect(fetchWorktrees).toHaveBeenCalledWith('repo2', { skipLineageRefresh: true })
    expect(refreshWorktreeLineageForRuntimeEnvironment).toHaveBeenCalledExactlyOnceWith('env-1')
    // Lineage runs after every per-repo worktree fetch.
    expect(calls).toEqual([
      'repos:env-1',
      'worktrees:repo1:true',
      'worktrees:repo2:true',
      'lineage:env-1'
    ])
  })

  it('still issues exactly one env-scoped lineage fetch when the env has zero repos', async () => {
    const { store, fetchWorktrees, refreshWorktreeLineageForRuntimeEnvironment } = createMockStore(
      []
    )

    await refreshRuntimeEnvironmentProjects(store, 'env-1')

    expect(fetchWorktrees).not.toHaveBeenCalled()
    expect(refreshWorktreeLineageForRuntimeEnvironment).toHaveBeenCalledExactlyOnceWith('env-1')
  })

  it('is invoked from the reposChanged client-event branch (source wiring)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const source = await fs.readFile(path.resolve(__dirname, '../../hooks/useIpcEvents.ts'), 'utf8')
    expect(source).toContain('refreshRuntimeEnvironmentProjects(useAppStore, environmentId)')
  })

  it('worktreesChanged uses env-scoped lineage, not the bare active-env fetch (source wiring)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const source = await fs.readFile(path.resolve(__dirname, '../../hooks/useIpcEvents.ts'), 'utf8')
    expect(source).toContain('fetchWorktrees(repoId, { skipLineageRefresh: true })')
    expect(source).toContain('refreshWorktreeLineageForRuntimeEnvironment(environmentId)')
  })
})
