import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, open, realpath, rm, stat, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FileBytesWritePrecondition } from '../../../shared/file-write/file-bytes-write'
import {
  FILE_WRITE_OK,
  type FileWriteResult
} from '../../../shared/file-write/file-write-disk-precondition'
import { renameFileWithWindowsRetryAsync } from '../../../shared/windows-retry-file-operations'
import { windowsFsPath } from '../../wsl/filesystem/wsl-unc-drive-fs-path'
import { isENOENT } from './access/filesystem-path-containment'
import { runLocalEditorWrite } from './local-disk-write-precondition'
import { assertLocalWriteTargetIsRegularFile } from './local-regular-file-read'

async function sha256OfFile(filePath: string): Promise<string | null> {
  const hash = createHash('sha256')
  try {
    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk)
    }
  } catch (error) {
    if (isENOENT(error)) {
      return null
    }
    throw error
  }
  return hash.digest('hex')
}

/**
 * Replaces a file's bytes atomically (sibling temp file, then rename) unless it no longer holds
 * the bytes the editor loaded. A symlink is followed, so its target is replaced, not the link.
 * The temp file is created 0600 and gets the target's mode only before the rename.
 */
export async function replaceLocalFileBytesIfUnchanged(
  requestedPath: string,
  writeTemp: (temp: FileHandle) => Promise<void>,
  precondition: FileBytesWritePrecondition
): Promise<FileWriteResult> {
  const filePath = windowsFsPath(requestedPath)
  return runLocalEditorWrite(filePath, async () => {
    const target = await realpath(filePath).catch((error: unknown) => {
      if (isENOENT(error)) {
        return filePath
      }
      throw error
    })
    if (precondition.expectedSha256 !== undefined) {
      const current = await sha256OfFile(target)
      if (current === null && precondition.allowMissing !== true) {
        return { ok: false, diskConflict: 'missing' }
      }
      if (current !== null && current !== precondition.expectedSha256) {
        return { ok: false, diskConflict: 'changed' }
      }
    }
    await assertLocalWriteTargetIsRegularFile(target)
    const mode = await stat(target).then(
      (stats) => stats.mode & 0o7777,
      () => null
    )
    // Why: embedding the file name would push a long but legal name past the 255-byte limit.
    const temp = join(dirname(target), `.orca-save-${randomUUID()}`)
    try {
      const handle = await open(temp, 'wx', 0o600)
      try {
        await writeTemp(handle)
      } finally {
        await handle.close()
      }
      // Why: a new file gets the mode a plain create would have given it.
      await chmod(temp, mode ?? 0o666 & ~process.umask())
      await renameFileWithWindowsRetryAsync(temp, target)
    } finally {
      await rm(temp, { force: true }).catch(() => undefined)
    }
    return FILE_WRITE_OK
  })
}
