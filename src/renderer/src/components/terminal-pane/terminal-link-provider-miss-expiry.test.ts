// Fork seam guard: the hover link provider itself must let a miss expire (8e7db4dedb), whatever existence path it uses.
import type { ILink } from '@xterm/xterm'
import { afterEach, expect, it, vi } from 'vitest'
import { createTerminalLinkTestDoubles } from './terminal-link-handlers-test-fixtures'
import { createProviderSetup, makeBufferLine } from './terminal-link-provider-buffer-fixtures'
import { installTerminalLinkTestEnvironment } from './terminal-link-handlers-test-harness'
import { TERMINAL_PATH_MISSING_CACHE_TTL_MS } from './terminal-path-exists-cache'

const doubles = createTerminalLinkTestDoubles()
const { storeState } = doubles

vi.mock('@/store', () => ({ useAppStore: { getState: () => storeState } }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: vi.fn(),
  activateAndRevealWorktree: vi.fn()
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: vi.fn(() => null) }))

installTerminalLinkTestEnvironment(doubles)

afterEach(() => {
  vi.useRealTimers()
})

it('links a path on hover once the file it named appears after the miss expires', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  let written = false
  window.api.shell.pathsExist = vi.fn(async (paths: string[]) => paths.map(() => written))
  const { provider } = createProviderSetup([makeBufferLine('./report.html')], new Map())
  const hover = () =>
    new Promise<ILink[]>((resolve) => provider.provideLinks(1, (links) => resolve(links ?? [])))

  expect(await hover()).toHaveLength(0)
  written = true
  vi.advanceTimersByTime(TERMINAL_PATH_MISSING_CACHE_TTL_MS)
  expect((await hover()).map((link) => link.text)).toEqual(['./report.html'])
})
