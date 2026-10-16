// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../../../shared/worktree/types'

const refreshGitStatusForWorktree = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock('../../git-status-refresh', () => ({
  refreshGitStatusForWorktree: (...args: unknown[]) => refreshGitStatusForWorktree(...args)
}))
let ownerEnvironmentId: string | null = null
vi.mock('../../worktree-git-owner-target', () => ({
  getWorktreeGitOwnerTarget: () =>
    ownerEnvironmentId
      ? { kind: 'environment', environmentId: ownerEnvironmentId }
      : { kind: 'local' }
}))
vi.mock('@/lib/connection-context', () => ({
  getConnectionId: (id: string) => (id.includes('ssh') ? 't1' : undefined)
}))

const { FOLDER_REPO_STATUS_INTERVAL_MS, useFolderRepoStatusRefresh } =
  await import('./use-folder-repo-status-refresh')
const { useAppStore } = await import('@/store')

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook reads only id, repoId and path.
const wt = { id: 'r1::/ssh/r1', repoId: 'r1', path: '/r1' } as Worktree

function seed(state: Record<string, unknown>): void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: tests seed only the slices the hook reads.
  useAppStore.setState(state as never)
}

async function mountAndRefresh(): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let trigger: () => Promise<void> = async () => undefined
  function Harness(): null {
    trigger = useFolderRepoStatusRefresh([wt], false)
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(React.createElement(Harness)))
  await act(async () => trigger())
  await act(async () => root.unmount())
}

describe('useFolderRepoStatusRefresh', () => {
  beforeEach(() => {
    refreshGitStatusForWorktree.mockClear()
    ownerEnvironmentId = null
    seed({
      repos: [{ id: 'r1', path: '/r1', displayName: 'r1', badgeColor: '', addedAt: 0 }],
      gitStatusHugeByWorktree: {},
      sshConnectionStates: new Map([['t1', { status: 'connected' }]])
    })
  })

  it('still probes a truncated repo on an explicit refresh', async () => {
    seed({ gitStatusHugeByWorktree: { [wt.id]: true } })
    await mountAndRefresh()
    expect(refreshGitStatusForWorktree).toHaveBeenCalledTimes(1)
  })

  it('skips a truncated repo on the periodic poll', async () => {
    vi.useFakeTimers()
    try {
      seed({ gitStatusHugeByWorktree: { [wt.id]: true } })
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      const root = createRoot(document.createElement('div'))
      function Harness(): null {
        useFolderRepoStatusRefresh([wt], true)
        return null
      }
      await act(async () => root.render(React.createElement(Harness)))
      expect(refreshGitStatusForWorktree).toHaveBeenCalledTimes(1)
      refreshGitStatusForWorktree.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(FOLDER_REPO_STATUS_INTERVAL_MS)
      })
      expect(refreshGitStatusForWorktree).not.toHaveBeenCalled()
      await act(async () => root.unmount())
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not gate a paired server's SSH repo on this client's own SSH map", async () => {
    seed({
      repos: [
        {
          id: 'r1',
          path: '/r1',
          displayName: 'r1',
          badgeColor: '',
          addedAt: 0,
          executionHostId: 'runtime:envA',
          connectionId: 't1'
        }
      ],
      sshConnectionStates: new Map()
    })
    ownerEnvironmentId = 'envA'
    await mountAndRefresh()
    expect(refreshGitStatusForWorktree).toHaveBeenCalledTimes(1)
  })

  it("still gates this client's own disconnected SSH repo", async () => {
    seed({
      repos: [
        { id: 'r1', path: '/r1', displayName: 'r1', badgeColor: '', addedAt: 0, connectionId: 't1' }
      ],
      sshConnectionStates: new Map()
    })
    await mountAndRefresh()
    expect(refreshGitStatusForWorktree).not.toHaveBeenCalled()
  })
})
