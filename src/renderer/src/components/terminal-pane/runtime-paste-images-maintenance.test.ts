import { describe, expect, it, vi } from 'vitest'

vi.mock('@/runtime/runtime-file-client', () => ({ readRuntimeDirectory: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  getActiveRuntimeTarget: vi.fn(() => ({ kind: 'environment', environmentId: 'env-1' })),
  callRuntimeRpc: vi.fn()
}))

import { readRuntimeDirectory } from '@/runtime/runtime-file-client'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import {
  ensureRuntimePasteImagesGitignore,
  pruneRuntimePasteImages
} from './runtime-paste-images-maintenance'

const ctx = {
  settings: { activeRuntimeEnvironmentId: 'env-1' },
  worktreeId: 'wt-1',
  worktreePath: '/remote/repo'
}

describe('pruneRuntimePasteImages', () => {
  it('keeps the newest N by embedded timestamp and deletes the rest', async () => {
    ;(readRuntimeDirectory as never as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'orca-paste-100-a.png' },
      { name: 'orca-paste-300-c.png' },
      { name: 'orca-paste-200-b.png' }
    ])
    await pruneRuntimePasteImages(ctx as never, 'wt-1', '/remote/repo', { keep: 1 })
    // newest (ts 300) kept; deletes ts 200 and ts 100
    expect(callRuntimeRpc as never as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.anything(),
      'files.delete',
      expect.objectContaining({ relativePath: '.orca/paste-images/orca-paste-200-b.png' }),
      expect.anything()
    )
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      expect.anything(),
      'files.delete',
      expect.objectContaining({ relativePath: '.orca/paste-images/orca-paste-100-a.png' }),
      expect.anything()
    )
  })

  it('never throws when listing fails', async () => {
    ;(readRuntimeDirectory as never as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('nope')
    )
    await expect(
      pruneRuntimePasteImages(ctx as never, 'wt-1', '/remote/repo')
    ).resolves.toBeUndefined()
  })
})

describe('ensureRuntimePasteImagesGitignore', () => {
  it('swallows the already-exists error', async () => {
    ;(callRuntimeRpc as never as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('invalid_relative_path? no — exists')
    )
    await expect(ensureRuntimePasteImagesGitignore(ctx as never, 'wt-1')).resolves.toBeUndefined()
  })
})
