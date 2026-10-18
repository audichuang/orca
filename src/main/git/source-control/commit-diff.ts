import type { GitDiffResult } from '../../../shared/git-diff-compare-types'
import { stableInFlightKey } from '../../../shared/in-flight-promise-dedupe'
import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitRuntimeOptionsKey } from './git-runtime-options-cache-key'
import { gitDiffReadDedupe } from './git-read-cache-invalidation'
import { buildDiffResult } from './diff-result'
import { readGitBlobAtOidPath } from './git-blob-read'

export async function getCommitDiff(
  worktreePath: string,
  args: {
    commitOid: string
    parentOid?: string | null
    filePath: string
    oldPath?: string
  },
  options: GitRuntimeOptions = {}
): Promise<GitDiffResult> {
  return gitDiffReadDedupe.run(
    stableInFlightKey([
      'commitDiff',
      worktreePath,
      args.commitOid,
      args.parentOid ?? null,
      args.filePath,
      args.oldPath ?? null,
      ...gitRuntimeOptionsKey(options)
    ]),
    () => loadCommitDiff(worktreePath, args, options)
  )
}

async function loadCommitDiff(
  worktreePath: string,
  args: {
    commitOid: string
    parentOid?: string | null
    filePath: string
    oldPath?: string
  },
  options: GitRuntimeOptions
): Promise<GitDiffResult> {
  try {
    const leftPath = args.oldPath ?? args.filePath
    // Why concurrent: the two sides are independent `git show` spawns. A root
    // commit has no parent to read, so that side resolves without a spawn.
    const [leftBlob, rightBlob] = await Promise.all([
      args.parentOid
        ? readGitBlobAtOidPath(worktreePath, args.parentOid, leftPath, options)
        : Promise.resolve({ content: '', isBinary: false, exists: false }),
      readGitBlobAtOidPath(worktreePath, args.commitOid, args.filePath, options)
    ])

    const result = buildDiffResult(
      leftBlob.content,
      rightBlob.content,
      leftBlob.isBinary,
      rightBlob.isBinary,
      args.filePath
    )
    // Why: like file-diff, lets callers tell an empty blob from an absent side; [] proves both reads succeeded.
    result.missingSides = [
      ...(leftBlob.exists ? [] : ['original' as const]),
      ...(rightBlob.exists ? [] : ['modified' as const])
    ]
    return result
  } catch {
    return {
      kind: 'text',
      originalContent: '',
      modifiedContent: '',
      originalIsBinary: false,
      modifiedIsBinary: false,
      missingSides: ['original', 'modified']
    }
  }
}
