// Fork: ClipCode restore on a remote host swaps an uploaded temp in through this upstream method.
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeFileMutations } from './file-mutations'
import type { RuntimeFileCommandHost } from './file-command-host'

// Path authorization needs the profile's registered roots; the temp dir stands in as authorized.
vi.mock('./chat-scratch-file-root', () => ({
  resolveRuntimeAuthorizedPath: async (path: string) => path
}))

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const loaded = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00])
const uploaded = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x80, 0xfe, 0x00, 0x01])

let root = ''
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'orca-replace-upload-')))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function mutations(): RuntimeFileMutations {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: replaceFileExplorerFileWithUpload reads only these two host members.
  const host = {
    requireStore: () => ({}),
    resolveRuntimeFileTarget: async () => ({
      worktree: { id: 'wt-1', repoId: 'repo-1', path: root },
      executionHostId: 'local'
    })
  } as unknown as RuntimeFileCommandHost
  return new RuntimeFileMutations(host)
}

it('replaces the file with the uploaded temp bytes and removes the temp', async () => {
  await writeFile(join(root, 'archive.zip'), loaded)
  await writeFile(join(root, '.orca-save-upload'), uploaded)

  await expect(
    mutations().replaceFileExplorerFileWithUpload(
      'wt-1',
      '.orca-save-upload',
      'archive.zip',
      { expectedSha256: sha256(loaded) },
      undefined,
      undefined,
      'local'
    )
  ).resolves.toEqual({ ok: true })

  expect(new Uint8Array(await readFile(join(root, 'archive.zip')))).toEqual(uploaded)
  expect(await readdir(root)).toEqual(['archive.zip'])
})
