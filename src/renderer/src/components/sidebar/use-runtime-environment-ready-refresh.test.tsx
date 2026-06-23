// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeEnvironmentStatus } from '../../store/slices/runtime-status'

const mocks = vi.hoisted(() => ({ refreshRuntimeEnvironmentWorktrees: vi.fn() }))
vi.mock('@/store/slices/runtime-environment-project-refresh', () => ({
  refreshRuntimeEnvironmentWorktrees: mocks.refreshRuntimeEnvironmentWorktrees
}))

import { useAppStore } from '@/store'
import { useRuntimeEnvironmentReadyRefresh } from './use-runtime-environment-ready-refresh'

const withGraph = (graphStatus: string): RuntimeEnvironmentStatus =>
  ({ status: { graphStatus } as never, checkedAt: 0 }) as RuntimeEnvironmentStatus

function HookProbe(): null {
  useRuntimeEnvironmentReadyRefresh()
  return null
}
const roots: Root[] = []
async function mountProbe(): Promise<void> {
  const container = document.createElement('div')
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<HookProbe />)
  })
}
async function setStatusMap(map: Map<string, RuntimeEnvironmentStatus>): Promise<void> {
  await act(async () => {
    useAppStore.setState({ runtimeStatusByEnvironmentId: map })
  })
}

beforeEach(() => {
  mocks.refreshRuntimeEnvironmentWorktrees.mockReset()
  useAppStore.setState({ runtimeStatusByEnvironmentId: new Map() })
})
afterEach(() => {
  act(() => {
    roots.forEach((r) => r.unmount())
  })
  roots.length = 0
})

describe('useRuntimeEnvironmentReadyRefresh', () => {
  it('does not refresh on first run (hands the initial set to startup hydration)', async () => {
    await setStatusMap(new Map([['env-1', withGraph('ready')]]))
    await mountProbe()
    expect(mocks.refreshRuntimeEnvironmentWorktrees).not.toHaveBeenCalled()
  })

  it('refreshes only the env that newly became ready, scoped to it', async () => {
    await mountProbe() // first run records the (empty) baseline
    await setStatusMap(
      new Map([
        ['env-1', withGraph('ready')],
        ['env-2', withGraph('reloading')]
      ])
    )
    expect(mocks.refreshRuntimeEnvironmentWorktrees).toHaveBeenCalledTimes(1)
    expect(mocks.refreshRuntimeEnvironmentWorktrees).toHaveBeenCalledWith(useAppStore, 'env-1')
  })

  it('refreshes a host only once it transitions reloading -> ready', async () => {
    await mountProbe()
    await setStatusMap(new Map([['env-1', withGraph('reloading')]]))
    expect(mocks.refreshRuntimeEnvironmentWorktrees).not.toHaveBeenCalled()
    await setStatusMap(new Map([['env-1', withGraph('ready')]]))
    expect(mocks.refreshRuntimeEnvironmentWorktrees).toHaveBeenCalledTimes(1)
    expect(mocks.refreshRuntimeEnvironmentWorktrees).toHaveBeenCalledWith(useAppStore, 'env-1')
  })
})
