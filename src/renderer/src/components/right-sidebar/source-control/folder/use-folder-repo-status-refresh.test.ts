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
let copyHostId: string | null = null
vi.mock('@/lib/worktree-git-copy', () => ({
  resolveWorktreeGitCopyNow: (id: string) => ({
    worktreeId: id,
    hostId: copyHostId,
    connectionId: id.includes('ssh') ? 't1' : undefined,
    transport: ownerEnvironmentId
      ? { kind: 'environment', environmentId: ownerEnvironmentId }
      : { kind: 'local' }
  })
}))

const { FOLDER_REPO_STATUS_INTERVAL_MS, useFolderRepoStatusRefresh } =
  await import('./use-folder-repo-status-refresh')
const { useAppStore } = await import('@/store')
const { ORCA_EDITOR_FILE_SAVED_EVENT } = await import('@/components/editor/editor-autosave')

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
    copyHostId = null
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

  it('may wake a stopped WSL distro on open and manual refresh, never on a poll or save nudge', async () => {
    vi.useFakeTimers()
    try {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      const root = createRoot(document.createElement('div'))
      let trigger: () => Promise<void> = async () => undefined
      function Harness(): null {
        trigger = useFolderRepoStatusRefresh([wt], true)
        return null
      }
      const requested = (
        n: number,
        request: { admissionTier: string; wakeWslDistro?: boolean }
      ): void =>
        expect(refreshGitStatusForWorktree).toHaveBeenNthCalledWith(
          n,
          expect.objectContaining({ request })
        )
      const woken = { admissionTier: 'background', wakeWslDistro: true }
      await act(async () => root.render(React.createElement(Harness)))
      requested(1, woken)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(FOLDER_REPO_STATUS_INTERVAL_MS)
      })
      requested(2, { admissionTier: 'background' })
      await act(async () => trigger())
      requested(3, woken)
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent(ORCA_EDITOR_FILE_SAVED_EVENT, {
            detail: { fileId: 'f', content: '', filePath: '/r1/a.ts' }
          })
        )
        await vi.advanceTimersByTimeAsync(1_000)
      })
      requested(4, { admissionTier: 'background' })
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

  it("refreshes through the resolved copy's host and transport", async () => {
    ownerEnvironmentId = 'envA'
    copyHostId = 'runtime:envA'
    await mountAndRefresh()
    expect(refreshGitStatusForWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'environment', environmentId: 'envA' },
        ownerHostId: 'runtime:envA',
        connectionId: 't1'
      })
    )
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

  it('runs one more pass when a manual refresh lands mid-sweep', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    let release: () => void = () => undefined
    refreshGitStatusForWorktree.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => (release = () => resolve(undefined)))
    )
    let trigger: () => Promise<void> = async () => undefined
    function Harness(): null {
      trigger = useFolderRepoStatusRefresh([wt], false)
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(React.createElement(Harness)))
    let first: Promise<void> = Promise.resolve()
    let second: Promise<void> = Promise.resolve()
    await act(async () => {
      first = trigger()
      second = trigger()
    })
    expect(refreshGitStatusForWorktree).toHaveBeenCalledTimes(1)
    await act(async () => {
      release()
      await Promise.all([first, second])
    })
    expect(refreshGitStatusForWorktree).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })
})
