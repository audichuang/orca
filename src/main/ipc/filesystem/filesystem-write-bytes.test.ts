import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { registerFilesystemWriteHandlers } from './filesystem-write-handlers'
import { replaceLocalFileBytesIfUnchanged } from './local-disk-bytes-replace'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

const handlers = vi.hoisted(() => new Map<string, (_event: unknown, args: unknown) => unknown>())
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (_event: unknown, args: unknown) => unknown) =>
      handlers.set(name, handler)
  },
  shell: {}
}))
vi.mock('./access/local-file-access-resolution', () => ({
  resolveLocalWriteRequestPath: async (path: string) => path
}))
vi.mock('./filesystem-mutations', () => ({ registerFilesystemMutationHandlers: vi.fn() }))
vi.mock('../agent-session-attachment-upload-ipc', () => ({
  registerAgentSessionAttachmentUploadHandlers: vi.fn()
}))

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const loaded = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00])
const edited = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x80, 0xfe, 0x00, 0x01])

let root = ''
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-bytes-ipc-'))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: authorization is stubbed, and no other context member is used by this handler.
  registerFilesystemWriteHandlers({ store: {} } as FilesystemHandlerContext)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  handlers.clear()
})

function writeBytes(filePath: string, bytes: Uint8Array, expectedSha256?: string) {
  return handlers.get('fs:writeFileBytes')!(null, {
    filePath,
    bytes,
    diskPrecondition: expectedSha256 ? { expectedSha256, allowMissing: true } : {}
  })
}

it('replaces the bytes atomically when the file still holds what the editor loaded', async () => {
  const filePath = join(root, 'book.xlsx')
  await writeFile(filePath, loaded)
  await expect(writeBytes(filePath, edited, sha256(loaded))).resolves.toEqual({ ok: true })
  expect(new Uint8Array(await readFile(filePath))).toEqual(edited)
  expect(await readdir(root)).toEqual(['book.xlsx'])
})

it('refuses a stale baseline and leaves the newer disk bytes alone', async () => {
  const filePath = join(root, 'book.xlsx')
  await writeFile(filePath, new Uint8Array([1, 2, 3]))
  await expect(writeBytes(filePath, edited, sha256(loaded))).resolves.toEqual({
    ok: false,
    diskConflict: 'changed'
  })
  expect(new Uint8Array(await readFile(filePath))).toEqual(new Uint8Array([1, 2, 3]))
})

it.skipIf(process.platform === 'win32')(
  'writes through a symlink to its target and keeps the file mode',
  async () => {
    const target = join(root, 'real.bin')
    const link = join(root, 'link.bin')
    await writeFile(target, loaded, { mode: 0o640 })
    await symlink(target, link)
    await expect(writeBytes(link, edited, sha256(loaded))).resolves.toEqual({ ok: true })
    expect(new Uint8Array(await readFile(target))).toEqual(edited)
    expect((await stat(target)).mode & 0o777).toBe(0o640)
  }
)

it('recreates a deleted file only when the save allows it', async () => {
  const filePath = join(root, 'gone.bin')
  await expect(
    handlers.get('fs:writeFileBytes')!(null, {
      filePath,
      bytes: edited,
      diskPrecondition: { expectedSha256: sha256(loaded) }
    })
  ).resolves.toEqual({ ok: false, diskConflict: 'missing' })
  await expect(writeBytes(filePath, edited, sha256(loaded))).resolves.toEqual({ ok: true })
  expect(new Uint8Array(await readFile(filePath))).toEqual(edited)
})

it('replaces a read-only file when overwriting and keeps it read-only', async () => {
  const filePath = join(root, 'locked.png')
  await writeFile(filePath, loaded, { mode: 0o444 })
  await expect(writeBytes(filePath, edited)).resolves.toEqual({ ok: true })
  expect(new Uint8Array(await readFile(filePath))).toEqual(edited)
  expect((await stat(filePath)).mode & 0o777).toBe(0o444)
  expect(await readdir(root)).toEqual(['locked.png'])
})

it.skipIf(process.platform === 'win32')(
  'creates the temporary file owner-only before any byte is written (no POSIX modes on Windows)',
  async () => {
    const filePath = join(root, 'secret.bin')
    let tempMode: number | undefined
    await replaceLocalFileBytesIfUnchanged(
      filePath,
      async (temp) => {
        tempMode = (await temp.stat()).mode & 0o777
        await temp.writeFile(edited)
      },
      {}
    )
    expect(tempMode).toBe(0o600)
    expect(new Uint8Array(await readFile(filePath))).toEqual(edited)
  }
)

it.skipIf(process.platform === 'win32')(
  'gives a new file the default mode, not the temporary 0600 (no POSIX modes on Windows)',
  async () => {
    const filePath = join(root, 'new.bin')
    await expect(writeBytes(filePath, edited)).resolves.toEqual({ ok: true })
    expect((await stat(filePath)).mode & 0o777).toBe(0o666 & ~process.umask())
  }
)
