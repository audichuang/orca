// Fork: ClipCode restore relies on these replace properties; upstream's cases stay in filesystem-write-bytes.test.ts.
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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

it.skipIf(process.platform === 'win32')(
  'replaces a file whose name is near the 255-byte name limit',
  async () => {
    const filePath = join(root, `${'n'.repeat(216)}.txt`)
    await writeFile(filePath, loaded)
    await expect(writeBytes(filePath, edited, sha256(loaded))).resolves.toEqual({ ok: true })
    expect(new Uint8Array(await readFile(filePath))).toEqual(edited)
  }
)

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

it.skipIf(process.platform === 'win32')(
  "keeps an existing file's mode after replacing its bytes (no POSIX modes on Windows)",
  async () => {
    const filePath = join(root, 'script.sh')
    await writeFile(filePath, loaded, { mode: 0o750 })
    await expect(writeBytes(filePath, edited, sha256(loaded))).resolves.toEqual({ ok: true })
    expect((await stat(filePath)).mode & 0o777).toBe(0o750)
  }
)
