import { basename } from '@/lib/path'
import type { RuntimeGitContext } from '@/runtime/source-control/git/runtime-git-client-context'
import type {
  GitBranchChangeEntry,
  GitDiffResult
} from '../../../../../../shared/git/diff/git-diff-compare-types'
import { mapWithConcurrency } from '../../../../../../shared/map-with-concurrency'
import {
  buildGitPayload,
  CLIPCODE_DEFAULTS,
  DELETED_FILE_MARKER,
  type ChangeTypeLabel
} from './clipcode-clipboard-format'
import {
  classifyClipcodeEntryContent,
  clipcodeGitClipboardPath,
  ClipcodeCopyTally,
  isClipcodeCopyablePath,
  isUnreadableModifiedSide,
  type ClipcodeReadContent
} from './clipcode-entry-content'
import type { ClipcodeGitCopyResult } from './clipcode-git-copy'

export type ClipcodeCommitCopyCommit = {
  commitOid: string
  /** First parent first; a merge lists every parent. */
  parentOids: readonly string[]
  entries: readonly GitBranchChangeEntry[]
}

export type ClipcodeCommitReaders = {
  readCommitDiff: (
    context: RuntimeGitContext,
    args: { commitOid: string; parentOid: string | null; filePath: string; oldPath?: string }
  ) => Promise<GitDiffResult>
}

// Why the parent cap: ClipCodeVSCode's graph copy reads a deleted file from ^1, ^2, then ^3.
const MAX_DELETED_PARENT_TRIES = 3
const COMMIT_TOO_LARGE_REASON = 'size exceeds limit (commit version too large to read)'
// Why bounded: each read is a git round trip, over SSH too; a few in flight hides latency without a burst.
const READ_CONCURRENCY = 6

function changeTypeFor(entry: GitBranchChangeEntry): ChangeTypeLabel {
  switch (entry.status) {
    case 'added':
    case 'copied':
      return 'NEW'
    case 'deleted':
      return 'DELETED'
    case 'renamed':
      return 'MOVED'
    case 'modified':
      return 'MODIFIED'
  }
}

type Content = ClipcodeReadContent | 'binary' | 'unreadable'

async function readCommittedContent(
  readers: ClipcodeCommitReaders,
  context: RuntimeGitContext,
  commit: ClipcodeCommitCopyCommit,
  entry: GitBranchChangeEntry
): Promise<Content> {
  try {
    // Why: both commit sides arrive textconv-converted; accepted risk, see FORK.md "Accepted risks".
    const diff = await readers.readCommitDiff(context, {
      commitOid: commit.commitOid,
      parentOid: commit.parentOids[0] ?? null,
      filePath: entry.path,
      ...(entry.oldPath ? { oldPath: entry.oldPath } : {})
    })
    if (diff.kind === 'binary') {
      return diff.modifiedIsBinary ? 'binary' : { text: diff.modifiedContent }
    }
    // Why: the viewer's render cap blanks both sides; it sits far above the 500 KB copy cap.
    if (diff.largeDiffRenderLimit?.limited) {
      return { skippedReason: COMMIT_TOO_LARGE_REASON }
    }
    if (isUnreadableModifiedSide(diff)) {
      return 'unreadable'
    }
    return { text: diff.modifiedContent }
  } catch {
    return 'unreadable'
  }
}

async function readDeletedContent(
  readers: ClipcodeCommitReaders,
  context: RuntimeGitContext,
  commit: ClipcodeCommitCopyCommit,
  entry: GitBranchChangeEntry
): Promise<Content> {
  // Why every parent: a merge can delete a file only its second parent ever had.
  for (const parentOid of commit.parentOids.slice(0, MAX_DELETED_PARENT_TRIES)) {
    try {
      const diff = await readers.readCommitDiff(context, {
        commitOid: commit.commitOid,
        parentOid,
        filePath: entry.path
      })
      if (diff.kind === 'binary' && diff.originalIsBinary) {
        return 'binary'
      }
      if (diff.kind === 'text' && diff.largeDiffRenderLimit?.limited) {
        continue
      }
      if (diff.originalContent !== '' || !diff.missingSides?.includes('original')) {
        return { text: diff.originalContent }
      }
    } catch {
      // Next parent.
    }
  }
  return { text: DELETED_FILE_MARKER }
}

type PlannedEntry = {
  clipboardPath: string
  changeType: ChangeTypeLabel
  commit: ClipcodeCommitCopyCommit
  entry: GitBranchChangeEntry
}

/**
 * Snipcode payload for one or more commits: each changed file as it stood after its commit,
 * a deleted file as it stood before. Paths are relative to `rootPath` so Paste & Restore in
 * the same workspace round-trips. `commits` is newest first (graph order); when commits
 * overlap, the newest commit's file wins.
 */
export async function buildClipcodeCommitCopy(args: {
  rootPath: string
  context: RuntimeGitContext
  commits: readonly ClipcodeCommitCopyCommit[]
  readers: ClipcodeCommitReaders
}): Promise<ClipcodeGitCopyResult> {
  const { rootPath, context, readers } = args
  const maxBytes = CLIPCODE_DEFAULTS.maxFileSizeKB * 1024
  const toClipboardPath = (path: string): string | undefined =>
    clipcodeGitClipboardPath(context.worktreePath, path, rootPath)
  // Why graph order, not author date: rebase and cherry-pick keep old author dates on newer commits.
  const seen = new Set<string>()
  const planned: PlannedEntry[] = []
  const tally = new ClipcodeCopyTally(false)
  for (const commit of args.commits) {
    for (const entry of commit.entries) {
      const clipboardPath = toClipboardPath(entry.path)
      if (!clipboardPath || seen.has(clipboardPath)) {
        continue
      }
      seen.add(clipboardPath)
      // Why: a newer rename moved the old path away; an older commit must not bring it back.
      const oldPath = entry.oldPath ? toClipboardPath(entry.oldPath) : undefined
      if (oldPath) {
        seen.add(oldPath)
      }
      const changeType = changeTypeFor(entry)
      // Why before reading: a non-portable name is named, never read or written into a header.
      if (isClipcodeCopyablePath(clipboardPath, changeType)) {
        planned.push({ clipboardPath, changeType, commit, entry })
      } else {
        tally.add(clipboardPath, { kind: 'unsafePath' })
      }
    }
  }
  const contents = await mapWithConcurrency(planned, READ_CONCURRENCY, (item) =>
    item.changeType === 'DELETED'
      ? readDeletedContent(readers, context, item.commit, item.entry)
      : readCommittedContent(readers, context, item.commit, item.entry)
  )

  planned.forEach((item, index) => {
    const content = contents[index]
    tally.add(
      item.clipboardPath,
      content === 'binary'
        ? { kind: 'binary' }
        : content === 'unreadable'
          ? { kind: 'unreadable' }
          : classifyClipcodeEntryContent(item.clipboardPath, item.changeType, content, maxBytes)
    )
  })
  // Why buildGitPayload: ClipCodeVSCode's commit copy always uses the git spacing.
  return tally.result((files) =>
    buildGitPayload({ ...CLIPCODE_DEFAULTS, files, sourceRoot: basename(rootPath) })
  )
}
