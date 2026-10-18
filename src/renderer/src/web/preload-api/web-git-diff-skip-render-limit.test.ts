// @vitest-environment happy-dom
// Fork seam guard: the web client must forward skipRenderLimit of git.diff.
import { describe, expect, it, vi } from 'vitest'

const callRuntimeResult = vi.hoisted(() => vi.fn())
vi.mock('./web-runtime-calls', () => ({ callRuntimeResult }))
vi.mock('./web-runtime-worktree-catalog', () => ({
  resolveRuntimeWorktreeByPath: vi.fn(),
  resolveRuntimeFilePath: async () => ({ worktree: { id: 'wt-1' }, relativePath: 'a.ts' })
}))

import { createGitApi } from './web-git-api'

describe('web git.diff (fork skipRenderLimit)', () => {
  it('sends skipRenderLimit through to the runtime', async () => {
    callRuntimeResult.mockResolvedValue({})
    await createGitApi().diff({
      worktreePath: '/repo',
      filePath: '/repo/a.ts',
      staged: true,
      skipRenderLimit: true
    })
    expect(callRuntimeResult).toHaveBeenCalledWith(
      'git.diff',
      expect.objectContaining({ worktree: 'id:wt-1', skipRenderLimit: true })
    )
  })
})
