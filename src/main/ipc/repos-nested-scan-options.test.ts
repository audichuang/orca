// Fork seam guard: descendIntoRepos must cross the projectGroups:scanNested IPC (options is z.unknown()) into scanNestedRepos.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as GitRunner from '../git/runner'
import type * as RepoModule from '../git/repo'

const { reposMocks, moduleMocks, scanNestedRepos } = await vi.hoisted(async () => {
  const moduleMocks = await import('./repos-remote-test-harness')
  return { reposMocks: moduleMocks.createReposIpcMocks(), moduleMocks, scanNestedRepos: vi.fn() }
})

vi.mock('electron', () => moduleMocks.electronModuleMock(reposMocks))
vi.mock('../git/repo', async (importOriginal) =>
  moduleMocks.gitRepoModuleMock(await importOriginal<typeof RepoModule>())
)
vi.mock('../git/runner', async (importOriginal) =>
  moduleMocks.gitRunnerModuleMock(reposMocks, await importOriginal<typeof GitRunner>())
)
vi.mock('../git/worktree', () => moduleMocks.gitWorktreeModuleMock(reposMocks))
vi.mock('./registered-worktree-roots-cache', () =>
  moduleMocks.registeredWorktreeRootsCacheModuleMock(reposMocks)
)
vi.mock('../worktree-root-preparation', () =>
  moduleMocks.worktreeRootPreparationModuleMock(reposMocks)
)
vi.mock('../project-groups/nested-repo-discovery', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  scanNestedRepos
}))

import { registerRepoHandlers } from './repos'
import { getGitRepoRoot, isGitRepo } from '../git/repo'
import { createRepoHandlerHarness, resetProjectGroupMocks } from './repos-remote-test-harness'

const { handleMock, mockStore } = reposMocks

describe('projectGroups:scanNested options (fork descendIntoRepos)', () => {
  const { handlers, mockWindow, captureHandlers } = createRepoHandlerHarness()

  beforeEach(() => {
    captureHandlers(handleMock)
    resetProjectGroupMocks(reposMocks, { isGitRepo, getGitRepoRoot })
    scanNestedRepos.mockReset().mockResolvedValue({ selectedPath: '/srv/platform', repos: [] })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: same partial Electron/store doubles repos-nested-scan.test.ts registers with; the handler reads only mocked members.
    registerRepoHandlers(mockWindow as never, mockStore as never, {} as never)
  })

  it('hands descendIntoRepos to scanNestedRepos', async () => {
    const options = { descendIntoRepos: true, maxDepth: 4 }
    await handlers.get('projectGroups:scanNested')!(null, { path: '/srv/platform', options })
    expect(scanNestedRepos).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/srv/platform', options })
    )
  })
})
