import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeGitContext } from '@/runtime/source-control/git/runtime-git-client-context'
import { clipcodeRuntimeReaders } from './clipcode-copy-action'

const context: RuntimeGitContext = {
  target: { kind: 'local' },
  worktreeId: 'wt-1',
  worktreePath: '/repo'
}
const api = {
  fs: {
    stat: vi.fn(async () => {
      throw new Error('EIO: i/o error')
    }),
    readFile: vi.fn(async (): Promise<{ content: string; isBinary: boolean }> => ({
      content: '',
      isBinary: true
    }))
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { api })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ClipCode working-file read when the raw-bytes read fails', () => {
  it('reports a file the text read then calls non-text as unreadable, and keeps a text read', async () => {
    // Include could not carry it, so it must be named, not dropped as non-text.
    await expect(clipcodeRuntimeReaders.readWorkingFile(context, 'logo.png')).rejects.toThrow(
      'EIO: i/o error'
    )

    api.fs.readFile.mockResolvedValueOnce({ content: 'hello', isBinary: false })
    await expect(clipcodeRuntimeReaders.readWorkingFile(context, 'a.ts')).resolves.toEqual({
      content: 'hello',
      isBinary: false
    })
  })
})
