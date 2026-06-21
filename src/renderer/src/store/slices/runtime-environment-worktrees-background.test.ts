import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/types'

const callRuntimeRpcMock = vi.fn()

vi.mock('../../runtime/runtime-rpc-client', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    callRuntimeRpc: (...args: unknown[]) => callRuntimeRpcMock(...args)
  }
})

function makeRuntimeRepo(id: string): Repo {
  return {
    id,
    path: `/remote/${id}`,
    displayName: id,
    badgeColor: '#000',
    addedAt: 0,
    executionHostId: 'runtime:env-1'
  } as Repo
}

describe('worktree refresh background lane forwarding', () => {
  beforeEach(() => {
    callRuntimeRpcMock.mockReset()
    callRuntimeRpcMock.mockImplementation((_target: unknown, method: string) => {
      if (method === 'worktree.detectedList') {
        return Promise.resolve({ repoId: 'repo1', worktrees: [], authoritative: true })
      }
      if (method === 'worktree.lineageList') {
        return Promise.resolve({ lineage: {}, workspaceLineage: {} })
      }
      return Promise.resolve({})
    })
    ;(globalThis as { window?: unknown }).window = { api: {} }
  })

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    vi.restoreAllMocks()
  })

  it('forwards background:true into worktree.detectedList for fetchWorktrees', async () => {
    const { createTestStore } = await import('./store-test-helpers')
    const store = createTestStore()
    store.setState({
      repos: [makeRuntimeRepo('repo1')],
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never
    })

    await store.getState().fetchWorktrees('repo1', { background: true })

    const detectedListCall = callRuntimeRpcMock.mock.calls.find(
      (c) => c[1] === 'worktree.detectedList'
    )
    expect(detectedListCall?.[3]).toMatchObject({ background: true })
  })

  it('leaves background undefined for a user-initiated fetchWorktrees', async () => {
    const { createTestStore } = await import('./store-test-helpers')
    const store = createTestStore()
    store.setState({
      repos: [makeRuntimeRepo('repo1')],
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never
    })

    await store.getState().fetchWorktrees('repo1')

    const detectedListCall = callRuntimeRpcMock.mock.calls.find(
      (c) => c[1] === 'worktree.detectedList'
    )
    expect(detectedListCall?.[3]?.background).toBeUndefined()
  })

  it('forwards background:true into worktree.lineageList for refreshWorktreeLineageForRuntimeEnvironment', async () => {
    const { createTestStore } = await import('./store-test-helpers')
    const store = createTestStore()
    store.setState({
      repos: [makeRuntimeRepo('repo1')],
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never
    })

    await store
      .getState()
      .refreshWorktreeLineageForRuntimeEnvironment('env-1', { background: true })

    const lineageListCall = callRuntimeRpcMock.mock.calls.find(
      (c) => c[1] === 'worktree.lineageList'
    )
    expect(lineageListCall?.[3]).toMatchObject({ background: true })
  })

  it('leaves background undefined for a user-initiated lineage refresh', async () => {
    const { createTestStore } = await import('./store-test-helpers')
    const store = createTestStore()
    store.setState({
      repos: [makeRuntimeRepo('repo1')],
      settings: { activeRuntimeEnvironmentId: 'env-1' } as never
    })

    await store.getState().refreshWorktreeLineageForRuntimeEnvironment('env-1')

    const lineageListCall = callRuntimeRpcMock.mock.calls.find(
      (c) => c[1] === 'worktree.lineageList'
    )
    expect(lineageListCall?.[3]?.background).toBeUndefined()
  })
})
