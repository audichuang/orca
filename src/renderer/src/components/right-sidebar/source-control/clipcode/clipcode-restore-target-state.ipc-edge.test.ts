import { mkdir, mkdtemp, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readCandidateState, readTargetState } from './clipcode-restore-target-state'

// Unlike the contract test, the runtime file clients stay real: only window.api.fs is stubbed, and it
// fails the way Electron IPC does (message survives, error.code is stripped). Upstream changes to
// isMissingRuntimePathError, statRuntimePath or readRuntimeDirectory routing redden this file.
function ipcError(channel: string, error: unknown): Error {
  return new Error(`Error invoking remote method '${channel}': ${String(error)}`)
}

let root = ''
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'clipcode-edge-'))
  await mkdir(path.join(root, 'src'))
  await writeFile(path.join(root, 'src', 'a.ts'), 'x')
  await writeFile(path.join(root, 'file.txt'), 'x')
})
afterEach(() => vi.unstubAllGlobals())

function stubFs(): void {
  vi.stubGlobal('window', {
    api: {
      fs: {
        stat: async ({ filePath }: { filePath: string }) => {
          try {
            const s = await stat(filePath)
            return { size: s.size, isDirectory: s.isDirectory(), mtime: s.mtimeMs }
          } catch (error) {
            throw ipcError('fs:stat', error)
          }
        },
        readDir: async ({ dirPath }: { dirPath: string }) => {
          try {
            return (await readdir(dirPath, { withFileTypes: true })).map((e) => ({
              name: e.name,
              isDirectory: e.isDirectory(),
              isSymlink: e.isSymbolicLink()
            }))
          } catch (error) {
            throw ipcError('fs:readDir', error)
          }
        }
      }
    }
  })
}

const context = () => ({
  target: { kind: 'local' as const },
  worktreeId: 'folder:f1',
  worktreePath: root
})

describe('ClipCode restore target state over the real runtime file clients', () => {
  it('reports a missing target as missing, not as a restore failure', async () => {
    stubFs()
    await expect(readTargetState(context(), path.join(root, 'new.ts'))).resolves.toBe('missing')
    await expect(readCandidateState(context(), root, 'new/dir/b.ts', new Map())).resolves.toBe(
      'missing'
    )
  })

  it('distinguishes file, directory and a file used as a parent', async () => {
    stubFs()
    await expect(readTargetState(context(), path.join(root, 'src'))).resolves.toBe('directory')
    await expect(readTargetState(context(), path.join(root, 'src', 'a.ts'))).resolves.toBe('file')
    await expect(readCandidateState(context(), root, 'file.txt/b.ts', new Map())).resolves.toBe(
      'parentIsFile'
    )
  })
})
