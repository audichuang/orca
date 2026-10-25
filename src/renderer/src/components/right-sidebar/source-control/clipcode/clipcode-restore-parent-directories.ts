// Copied from upstream components/tab-bar/tab-create-entry-action.ts createParentDirectoriesForNewFile
// and isExistsError (module-private there); re-sync on rebase.
import { joinPath } from '@/lib/path'
import type { createRuntimePath } from '@/runtime/runtime-file-mutation-client'
import type { statRuntimePath } from '@/runtime/runtime-file-metadata-client'
import type { RuntimeFileOperationArgs } from '@/runtime/runtime-file-client-types'

function isExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /\bEEXIST\b|already exists|file exists/i.test(message)
}

export async function createParentDirectoriesForNewFile(args: {
  context: RuntimeFileOperationArgs
  operations: {
    createRuntimePath: typeof createRuntimePath
    statRuntimePath: typeof statRuntimePath
  }
  relativePath: string
  worktreePath: string
}): Promise<void> {
  const directorySegments = args.relativePath.split('/').slice(0, -1)
  let currentPath = args.worktreePath

  for (const segment of directorySegments) {
    currentPath = joinPath(currentPath, segment)
    try {
      // Why: file creation authorizes the immediate parent before its own mkdir,
      // so nested new-file paths must materialize parents one level at a time.
      await args.operations.createRuntimePath(args.context, currentPath, 'directory')
    } catch (error) {
      if (!isExistsError(error)) {
        throw error
      }
      const stat = await args.operations.statRuntimePath(args.context, currentPath)
      if (!stat.isDirectory) {
        throw new Error(`Cannot create file because ${currentPath} is not a directory.`)
      }
    }
  }
}
