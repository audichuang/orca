import { joinPath } from '@/lib/path'
import { isMissingRuntimePathError } from '@/runtime/runtime-file-metadata-client'
import { readRuntimeDirectory } from '@/runtime/runtime-file-mutation-client'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'
import type { DirEntry } from '../../../../../../shared/filesystem-entry-types'

export type RestoreDirectoryCache = Map<string, Promise<DirEntry[] | null>>

function listDirectory(
  context: RuntimeFileOperationArgs,
  dirPath: string,
  cache: RestoreDirectoryCache
): Promise<DirEntry[] | null> {
  let listing = cache.get(dirPath)
  if (!listing) {
    listing = readRuntimeDirectory(context, dirPath).catch((error: unknown) => {
      if (isMissingRuntimePathError(error)) {
        return null
      }
      throw error
    })
    cache.set(dirPath, listing)
  }
  return listing
}

export type RestorePathObstacle = 'symlink' | 'parentIsFile'

/**
 * Walks the existing segments of `relativePath` below `root`. A symlink is refused instead of canonicalized:
 * the write layer would follow `alias -> .git` and still treat it as inside the root. A file in a parent
 * position would make the write fail with ENOTDIR. Listing failures other than "missing" throw, so the
 * caller fails closed (also on hosts that cannot list).
 */
export async function findRestorePathObstacle(
  context: RuntimeFileOperationArgs,
  root: string,
  relativePath: string,
  cache: RestoreDirectoryCache = new Map()
): Promise<RestorePathObstacle | null> {
  const segments = relativePath.split('/')
  let current = root
  for (const [index, segment] of segments.entries()) {
    const entries = await listDirectory(context, current, cache)
    // Why: macOS resolves names across case and Unicode normalization, so compare folded forms.
    const fold = (name: string) => name.normalize('NFC').toLowerCase()
    const entry =
      entries?.find((candidate) => candidate.name === segment) ??
      entries?.find((candidate) => fold(candidate.name) === fold(segment))
    if (!entry) {
      return null
    }
    if (entry.isSymlink) {
      return 'symlink'
    }
    if (!entry.isDirectory) {
      return index < segments.length - 1 ? 'parentIsFile' : null
    }
    current = joinPath(current, entry.name)
  }
  return null
}

/** True when any existing segment of `relativePath` below `root` is a symlink. */
export async function restorePathCrossesSymlink(
  context: RuntimeFileOperationArgs,
  root: string,
  relativePath: string,
  cache: RestoreDirectoryCache = new Map()
): Promise<boolean> {
  return (await findRestorePathObstacle(context, root, relativePath, cache)) === 'symlink'
}
