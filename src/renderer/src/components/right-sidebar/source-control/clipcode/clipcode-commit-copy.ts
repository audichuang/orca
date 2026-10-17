import { basename, getRelativePathInsideRoot, joinPath } from '@/lib/path'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import type {
  GitBranchChangeEntry,
  GitDiffResult
} from '../../../../../../shared/git-diff-compare-types'
import { getUtf8ByteLength, measureUtf8ByteLength } from '../../../../../../shared/utf8-byte-limits'
import {
  buildGitPayload,
  CLIPCODE_DEFAULTS,
  DELETED_FILE_MARKER,
  type ChangeTypeLabel,
  type PayloadFile
} from './clipcode-clipboard-format'
import type { ClipcodeGitCopyResult } from './clipcode-git-copy'

export type ClipcodeCommitCopyCommit = {
  commitOid: string
  /** First parent first; a merge lists every parent. */
  parentOids: readonly string[]
  /** Epoch ms; decides which commit wins when several touch one path. */
  timestamp?: number
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

type Content = { text: string } | { skippedReason: string } | 'binary' | 'unreadable'

async function readCommittedContent(
  readers: ClipcodeCommitReaders,
  context: RuntimeGitContext,
  commit: ClipcodeCommitCopyCommit,
  entry: GitBranchChangeEntry
): Promise<Content> {
  try {
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
    if (diff.modifiedContent === '' && diff.missingSides?.includes('modified')) {
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

/**
 * Snipcode payload for one or more commits: each changed file as it stood after its commit,
 * a deleted file as it stood before. Paths are relative to `rootPath` so Paste & Restore in
 * the same workspace round-trips; when commits overlap, the newest commit's file wins.
 */
export async function buildClipcodeCommitCopy(args: {
  rootPath: string
  context: RuntimeGitContext
  commits: readonly ClipcodeCommitCopyCommit[]
  readers: ClipcodeCommitReaders
}): Promise<ClipcodeGitCopyResult> {
  const { rootPath, context, readers } = args
  const maxBytes = CLIPCODE_DEFAULTS.maxFileSizeKB * 1024
  const newestFirst = args.commits
    .map((commit, index) => ({ commit, index }))
    .sort((a, b) => (b.commit.timestamp ?? 0) - (a.commit.timestamp ?? 0) || a.index - b.index)
  const seen = new Set<string>()
  const files: PayloadFile[] = []
  let skippedFileSizeCount = 0
  let unreadableFileCount = 0
  let skippedBinaryFileCount = 0

  for (const { commit } of newestFirst) {
    for (const entry of commit.entries) {
      const clipboardPath = getRelativePathInsideRoot(
        joinPath(context.worktreePath, entry.path),
        rootPath
      )?.replaceAll('\\', '/')
      if (!clipboardPath || seen.has(clipboardPath)) {
        continue
      }
      seen.add(clipboardPath)
      const changeType = changeTypeFor(entry)
      const content =
        changeType === 'DELETED'
          ? await readDeletedContent(readers, context, commit, entry)
          : await readCommittedContent(readers, context, commit, entry)
      if (content === 'unreadable') {
        unreadableFileCount++
        continue
      }
      if (content === 'binary' || ('text' in content && content.text.includes('\0'))) {
        skippedBinaryFileCount++
        continue
      }
      // Why: U+FFFD is what a lenient decode leaves of non-UTF-8 bytes; restoring it would corrupt the file.
      if (changeType !== 'DELETED' && 'text' in content && content.text.includes('�')) {
        unreadableFileCount++
        continue
      }
      if ('skippedReason' in content) {
        skippedFileSizeCount++
        files.push({ path: clipboardPath, changeType, skippedReason: content.skippedReason })
        continue
      }
      if (measureUtf8ByteLength(content.text, { stopAfterBytes: maxBytes }).exceededLimit) {
        skippedFileSizeCount++
        files.push({
          path: clipboardPath,
          changeType,
          skippedReason: `size exceeds limit (${getUtf8ByteLength(content.text)} bytes)`
        })
        continue
      }
      files.push({ path: clipboardPath, changeType, content: content.text })
    }
  }

  // Why buildGitPayload: ClipCodeVSCode's commit copy always uses the git spacing.
  const payload = files.length
    ? buildGitPayload({ ...CLIPCODE_DEFAULTS, files, sourceRoot: basename(rootPath) })
    : ''
  return {
    payload,
    copiedFileCount: files.length - skippedFileSizeCount,
    skippedFileSizeCount,
    unreadableFileCount,
    skippedBinaryFileCount,
    entryCount: files.length
  }
}
