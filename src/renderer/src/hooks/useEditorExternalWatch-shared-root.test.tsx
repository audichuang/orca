// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

type TestWatchTarget = {
  worktreeId: string
  worktreePath: string
  connectionId: string | undefined
  runtimeEnvironmentId: string | null
}

const state = vi.hoisted(() => {
  const targets: TestWatchTarget[] = []
  return { snapshot: { targets, targetsKey: '' } }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({})
}))
vi.mock('@/runtime/runtime-file-watch-client', () => ({
  subscribeRuntimeFileChanges: vi.fn()
}))
vi.mock('./editor-external-watch-targets', () => ({
  selectEditorExternalWatchTargets: () => state.snapshot,
  getEditorExternalWatchTargetKey: (target: TestWatchTarget) =>
    [
      target.worktreeId,
      target.worktreePath,
      target.connectionId ?? 'local',
      target.runtimeEnvironmentId ?? 'client'
    ].join('::')
}))
vi.mock('./editor-external-watch-event-reconciliation', () => ({
  buildEditorExternalWatchEventHandler: vi.fn(() => ({
    handleFsChanged: vi.fn(),
    dispose: vi.fn()
  }))
}))
vi.mock('./editor-external-watch-disk-verification', () => ({
  verifyLatchedEditorMoveDestinations: vi.fn()
}))

import { useEditorExternalWatch } from './useEditorExternalWatch'

function WatchProbe(): null {
  useEditorExternalWatch()
  return null
}

function folderTarget(id: string, connectionId?: string): TestWatchTarget {
  return {
    worktreeId: `folder:${id}`,
    worktreePath: '/work/MultiProduct',
    connectionId,
    runtimeEnvironmentId: null
  }
}

describe('useEditorExternalWatch on a root shared by several workspaces', () => {
  let previousApi: unknown
  let container: HTMLDivElement
  let root: Root
  let watchWorktree: ReturnType<typeof vi.fn>
  let unwatchWorktree: ReturnType<typeof vi.fn>

  const show = async (targets: TestWatchTarget[]): Promise<void> => {
    state.snapshot = {
      targets,
      targetsKey: targets.map((t) => `${t.worktreeId}@${t.connectionId ?? 'local'}`).join('|')
    }
    await act(async () => root.render(createElement(WatchProbe)))
  }

  beforeEach(() => {
    watchWorktree = vi.fn().mockResolvedValue(undefined)
    unwatchWorktree = vi.fn().mockResolvedValue(undefined)
    previousApi = Reflect.get(window, 'api')
    Reflect.set(window, 'api', {
      fs: { watchWorktree, unwatchWorktree, onFsChanged: vi.fn(() => vi.fn()) }
    })
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.set(window, 'api', previousApi)
  })

  it('keeps the root watched while another workspace on the same folder still needs it', async () => {
    await show([folderTarget('a')])
    await show([folderTarget('a'), folderTarget('b')])
    await show([folderTarget('a')])

    expect(watchWorktree).toHaveBeenCalledTimes(1)
    expect(unwatchWorktree).not.toHaveBeenCalled()

    await show([])
    expect(unwatchWorktree).toHaveBeenCalledTimes(1)
    expect(unwatchWorktree).toHaveBeenCalledWith({
      worktreePath: '/work/MultiProduct',
      connectionId: undefined
    })
  })

  it('hands the root from a removed workspace to one added in the same update', async () => {
    await show([folderTarget('a')])
    await show([folderTarget('b')])

    expect(watchWorktree).toHaveBeenCalledTimes(1)
    expect(unwatchWorktree).not.toHaveBeenCalled()
  })

  it('treats the same path on another SSH connection as a different root', async () => {
    await show([folderTarget('a'), folderTarget('b', 'ssh-1')])
    await show([folderTarget('a')])

    expect(watchWorktree).toHaveBeenCalledTimes(2)
    expect(unwatchWorktree).toHaveBeenCalledTimes(1)
    expect(unwatchWorktree).toHaveBeenCalledWith({
      worktreePath: '/work/MultiProduct',
      connectionId: 'ssh-1'
    })
  })

  it('unwatches a shared root once on unmount', async () => {
    await show([folderTarget('a'), folderTarget('b')])
    await act(async () => root.unmount())

    expect(watchWorktree).toHaveBeenCalledTimes(1)
    expect(unwatchWorktree).toHaveBeenCalledTimes(1)
    root = createRoot(container)
  })
})
