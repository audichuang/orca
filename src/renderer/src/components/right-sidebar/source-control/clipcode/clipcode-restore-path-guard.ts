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

/**
 * True when any existing segment of `relativePath` below `root` is a symlink. Restore refuses those
 * instead of canonicalizing: the write layer would follow `alias -> .git` and still treat it as inside the root.
 * Listing failures other than "missing" throw, so the caller fails closed (also on hosts that cannot list).
 */
export async function restorePathCrossesSymlink(
  context: RuntimeFileOperationArgs,
  root: string,
  relativePath: string,
  cache: RestoreDirectoryCache = new Map()
): Promise<boolean> {
  let current = root
  for (const segment of relativePath.split('/')) {
    const entries = await listDirectory(context, current, cache)
    // Why: macOS resolves names across case and Unicode normalization, so compare folded forms.
    const fold = (name: string) => name.normalize('NFC').toLowerCase()
    const entry =
      entries?.find((candidate) => candidate.name === segment) ??
      entries?.find((candidate) => fold(candidate.name) === fold(segment))
    if (!entry) {
      return false
    }
    if (entry.isSymlink) {
      return true
    }
    if (!entry.isDirectory) {
      return false
    }
    current = joinPath(current, entry.name)
  }
  return false
}
