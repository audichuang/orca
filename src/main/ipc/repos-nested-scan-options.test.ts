// Fork seam guard: descendIntoRepos must cross the projectGroups:scanNested IPC (options is z.unknown()) into scanNestedRepos.
import { describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, rawArgs: unknown) => unknown

const { handlers, scanNestedRepos } = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  scanNestedRepos: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => handlers.set(channel, handler),
    removeHandler: vi.fn()
  }
}))
vi.mock('../project-groups/nested-repo-discovery', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  scanNestedRepos
}))

import { registerProjectGroupHandlers } from './repos/project-group-handlers'

describe('projectGroups:scanNested options (fork descendIntoRepos)', () => {
  it('hands descendIntoRepos to scanNestedRepos', async () => {
    scanNestedRepos.mockResolvedValue({ selectedPath: '/srv/platform', repos: [] })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the scanNested handler reads none of the window, store or runtime.
    registerProjectGroupHandlers({} as never, {} as never, {} as never)
    const options = { descendIntoRepos: true, maxDepth: 4 }
    await handlers.get('projectGroups:scanNested')!({}, { path: '/srv/platform', options })
    expect(scanNestedRepos).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/srv/platform', options })
    )
  })
})
