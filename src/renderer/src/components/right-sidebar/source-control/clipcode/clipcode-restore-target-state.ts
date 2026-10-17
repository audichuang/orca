import { readIpcErrorMessage } from '@/lib/ipc-error'
import { joinPath } from '@/lib/path'
import { isMissingRuntimePathError, statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import { readRuntimeFileContent } from '@/runtime/runtime-file-read-client'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import {
  findRestorePathObstacle,
  restorePathCrossesSymlink,
  type RestoreDirectoryCache,
  type RestorePathObstacle
} from './clipcode-restore-path-guard'
import type { ClipcodeTargetState } from './clipcode-restore-plan'

export async function readTargetState(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): Promise<ClipcodeTargetState> {
  try {
    return (await statRuntimePath(context, absolutePath)).isDirectory ? 'directory' : 'file'
  } catch (error) {
    if (isMissingRuntimePathError(error)) {
      return 'missing'
    }
    throw error
  }
}

// Fail closed: a path that crosses a symlink, or cannot be listed on the host, is never written.
export async function isRestorePathBlocked(
  context: RuntimeFileOperationArgs,
  root: string,
  relativePath: string,
  cache: RestoreDirectoryCache
): Promise<boolean> {
  try {
    return await restorePathCrossesSymlink(context, root, relativePath, cache)
  } catch {
    return true
  }
}

// Why: one bad target (ENOTDIR, EACCES, a host that cannot list) must skip only that entry, not abort the whole restore.
export async function readCandidateState(
  context: RuntimeFileOperationArgs,
  root: string,
  relativePath: string,
  cache: RestoreDirectoryCache
): Promise<ClipcodeTargetState> {
  let obstacle: RestorePathObstacle | null
  try {
    obstacle = await findRestorePathObstacle(context, root, relativePath, cache)
  } catch {
    return 'blocked'
  }
  if (obstacle === 'symlink') {
    return 'blocked'
  }
  if (obstacle === 'parentIsFile') {
    return 'parentIsFile'
  }
  let state: ClipcodeTargetState
  try {
    state = await readTargetState(context, joinPath(root, relativePath))
  } catch (error) {
    return /\bENOTDIR\b/.test(String(readIpcErrorMessage(error) ?? error))
      ? 'parentIsFile'
      : 'unreadable'
  }
  return state === 'file' ? readExistingFileEncoding(context, root, relativePath) : state
}

// Why: the wire carries no encoding, so writing UTF-8 over a non-UTF-8 file would silently change it (plugin NON_UTF8_TARGET).
async function readExistingFileEncoding(
  context: RuntimeFileOperationArgs,
  root: string,
  relativePath: string
): Promise<ClipcodeTargetState> {
  try {
    const file = await readRuntimeFileContent({
      target: context.target,
      filePath: joinPath(root, relativePath),
      relativePath,
      worktreeId: context.worktreeId ?? undefined,
      connectionId: context.connectionId
    })
    // Why: the host decodes leniently, so U+FFFD is the trace of bytes that were not UTF-8.
    return file.isBinary || file.content.includes('\uFFFD') ? 'nonUtf8File' : 'file'
  } catch {
    return 'unverifiedFile'
  }
}
