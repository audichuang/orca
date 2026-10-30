import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import {
  clipcodeCommitReaders,
  clipcodeExplorerReaders,
  clipcodeRuntimeReaders
} from './clipcode-copy-action'

const DIFF = {
  kind: 'text',
  originalContent: '',
  modifiedContent: '',
  originalIsBinary: false,
  modifiedIsBinary: false
}
const context: RuntimeGitContext = {
  target: { kind: 'local' },
  worktreeId: 'wt-1',
  worktreePath: '/repo'
}
const api = {
  git: { diff: vi.fn(async () => DIFF), commitDiff: vi.fn(async () => DIFF) },
  fs: {
    readFile: vi.fn(async () => ({ content: 'x', isBinary: false })),
    readDir: vi.fn(async () => [])
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { api })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Upstream v1.4.245 refuses Git and file reads on a stopped WSL distro unless the caller marks a user act.
describe('ClipCode Copy Full Source on a stopped WSL distro', () => {
  it('marks every read of a copy as the user act that may start the distro', async () => {
    await clipcodeRuntimeReaders.readDiff(context, { filePath: 'a.ts', staged: true })
    await clipcodeRuntimeReaders.readWorkingFile(context, 'a.ts')
    await clipcodeCommitReaders.readCommitDiff(context, {
      commitOid: 'abc',
      parentOid: null,
      filePath: 'a.ts'
    })
    const explorer = clipcodeExplorerReaders(context, false)
    await explorer.readDir('/repo/src')
    await explorer.readFile('/repo/src/a.ts')

    for (const read of [api.git.diff, api.git.commitDiff, api.fs.readDir]) {
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ wakeWslDistro: true }))
    }
    expect(api.fs.readFile).toHaveBeenCalledTimes(2)
    for (const call of [1, 2]) {
      expect(api.fs.readFile).toHaveBeenNthCalledWith(
        call,
        expect.objectContaining({ wakeWslDistro: true })
      )
    }
  })
})
