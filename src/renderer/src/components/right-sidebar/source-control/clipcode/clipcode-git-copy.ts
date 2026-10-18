import { getRelativePathInsideRoot, basename, joinPath } from '@/lib/path'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import type { GitDiffResult } from '../../../../../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import {
  buildGitPayload,
  buildPayload,
  CLIPCODE_DEFAULTS,
  DELETED_FILE_MARKER,
  type ChangeTypeLabel,
  type PayloadFile
} from './clipcode-clipboard-format'
import { classifyClipcodeEntryContent } from './clipcode-entry-content'

export type ClipcodeCopyRepo = {
  /** Git owner transport of this repo; reads never touch the local fs directly. */
  context: RuntimeGitContext
  entries: readonly GitStatusEntry[]
  /** True when the user picked rows from the staged section, so the index version is copied. */
  forceIndexForStaged: boolean
}

export type ClipcodeContentReaders = {
  readDiff: (
    context: RuntimeGitContext,
    args: {
      filePath: string
      staged: boolean
      compareAgainstHead?: boolean
      skipRenderLimit?: boolean
    }
  ) => Promise<GitDiffResult>
  readWorkingFile: (
    context: RuntimeGitContext,
    relativePath: string
  ) => Promise<{ content: string; isBinary: boolean }>
}

export type ClipcodeGitCopyResult = {
  payload: string
  /** Files whose content was copied; size-skipped files are counted separately. */
  copiedFileCount: number
  skippedFileSizeCount: number
  /** Files dropped because a read failed (not binary, not too large). */
  unreadableFileCount: number
  /** Binary files left out of the payload (Snipcode never copies their bytes). */
  skippedBinaryFileCount: number
  /** Number of payload entries, skip lines included. */
  entryCount: number
}

// Working tree wins over index when one path appears in several areas (Snipcode dedupe order).
const AREA_ORDER: Record<GitStatusEntry['area'], number> = { unstaged: 0, untracked: 1, staged: 2 }

function changeTypeFor(entry: GitStatusEntry): ChangeTypeLabel {
  switch (entry.status) {
    case 'added':
    case 'untracked':
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

type Content = { text: string } | { skippedReason: string } | null
type WorkingContent = Content | 'unreadable'

const STAGED_TOO_LARGE_REASON = 'size exceeds limit (staged version too large to read)'

async function readHeadContent(
  readers: ClipcodeContentReaders,
  context: RuntimeGitContext,
  entry: GitStatusEntry
): Promise<string | null> {
  try {
    const staged = entry.area === 'staged'
    const diff = await readers.readDiff(context, {
      filePath: entry.path,
      staged,
      compareAgainstHead: !staged
    })
    // Why: a deleted binary has no text to copy; excluding it beats pasting a deletion marker over real bytes.
    if (diff.kind === 'binary' && diff.originalIsBinary) {
      return null
    }
    if (diff.kind === 'binary' && diff.originalContent !== '') {
      return diff.originalContent
    }
    if (
      diff.kind === 'text' &&
      !diff.largeDiffRenderLimit?.limited &&
      (diff.originalContent || !diff.missingSides?.includes('original'))
    ) {
      return diff.originalContent
    }
  } catch {
    // Falls through to the marker, like Snipcode when HEAD cannot be read.
  }
  return DELETED_FILE_MARKER
}

async function readIndexContent(
  readers: ClipcodeContentReaders,
  context: RuntimeGitContext,
  entry: GitStatusEntry
): Promise<WorkingContent> {
  // Why: the working tree is a different version; copying it for a staged row would paste unstaged edits.
  try {
    // Why: the viewer's render limit blanks big blobs; ask for the full index text (old hosts ignore the flag).
    const diff = await readers.readDiff(context, {
      filePath: entry.path,
      staged: true,
      skipRenderLimit: true
    })
    // Why: only the index side decides; a binary HEAD blob replaced by text still has valid staged text.
    if (diff.kind === 'binary') {
      if (diff.modifiedIsBinary) {
        return null
      }
      // Why: an empty staged text blob over a binary HEAD is valid; only a missing or unreadable side is not.
      return diff.modifiedContent === '' && diff.missingSides?.includes('modified')
        ? 'unreadable'
        : { text: diff.modifiedContent }
    }
    // Why: a host that predates skipRenderLimit still blanks both sides, so the index text is unreadable here.
    if (diff.largeDiffRenderLimit?.limited) {
      return { skippedReason: STAGED_TOO_LARGE_REASON }
    }
    // Why: a failed read is reported via missingSides; an empty index blob is valid content (Snipcode copies '').
    if (diff.modifiedContent === '' && diff.missingSides?.includes('modified')) {
      return 'unreadable'
    }
    return { text: diff.modifiedContent }
  } catch {
    return 'unreadable'
  }
}

async function readWorkingContent(
  readers: ClipcodeContentReaders,
  context: RuntimeGitContext,
  entry: GitStatusEntry
): Promise<WorkingContent> {
  try {
    const file = await readers.readWorkingFile(context, entry.path)
    return file.isBinary ? null : { text: file.content }
  } catch (error) {
    // Why: a remote preview-sized read throws for big files; Snipcode would write a size skip line for them.
    if (error instanceof Error && error.message.startsWith('Remote file is too large')) {
      return { skippedReason: 'size exceeds limit' }
    }
    return 'unreadable'
  }
}

/**
 * Collects the Snipcode clipboard payload for git changes. Paths are relative to `rootPath`
 * (the folder workspace, or the worktree for a plain repo), so a restore in the same root round-trips.
 */
export async function buildClipcodeGitCopy(args: {
  rootPath: string
  repos: readonly ClipcodeCopyRepo[]
  readers: ClipcodeContentReaders
}): Promise<ClipcodeGitCopyResult> {
  const { rootPath, repos, readers } = args
  const maxBytes = CLIPCODE_DEFAULTS.maxFileSizeKB * 1024
  const seen = new Set<string>()
  const files: PayloadFile[] = []
  let usedIndexContent = false
  let hasDeleted = false
  let skippedFileSizeCount = 0
  let unreadableFileCount = 0
  const binaryPaths = new Set<string>()

  for (const repo of repos) {
    const ordered = repo.entries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => AREA_ORDER[a.entry.area] - AREA_ORDER[b.entry.area] || a.index - b.index)
    for (const { entry } of ordered) {
      // Gitlink rows and submodule-internal rows carry no text of their own.
      if (entry.submodule || entry.submoduleRoot) {
        continue
      }
      if (entry.conflictStatus === 'unresolved' && entry.conflictKind === 'both_deleted') {
        continue
      }
      const relativePath = getRelativePathInsideRoot(
        joinPath(repo.context.worktreePath, entry.path),
        rootPath
      )
      const clipboardPath = relativePath?.replaceAll('\\', '/')
      if (!clipboardPath || seen.has(clipboardPath)) {
        continue
      }
      const changeType = changeTypeFor(entry)
      let content: WorkingContent
      let fromIndex = false
      if (changeType === 'DELETED') {
        const head = await readHeadContent(readers, repo.context, entry)
        content = head === null ? null : { text: head }
      } else if (entry.area === 'staged' && repo.forceIndexForStaged) {
        // Why: Snipcode picks the git spacing from the request, even when the index read is skipped.
        fromIndex = true
        content = await readIndexContent(readers, repo.context, entry)
      } else {
        content = await readWorkingContent(readers, repo.context, entry)
      }
      if (content === 'unreadable') {
        unreadableFileCount++
        continue
      }
      const verdict =
        content === null
          ? ({ kind: 'binary' } as const)
          : classifyClipcodeEntryContent(clipboardPath, changeType, content, maxBytes)
      if (verdict.kind === 'binary') {
        binaryPaths.add(clipboardPath)
        continue
      }
      if (verdict.kind === 'unreadable') {
        unreadableFileCount++
        continue
      }
      seen.add(clipboardPath)
      hasDeleted ||= changeType === 'DELETED'
      usedIndexContent ||= fromIndex
      if (verdict.sizeSkipped) {
        skippedFileSizeCount++
      }
      files.push(verdict.file)
    }
  }

  // Why: Snipcode picks the git spacing (no empty wrappers) only for deleted or index copies; byte parity needs the same quirk.
  const build = hasDeleted || usedIndexContent ? buildGitPayload : buildPayload
  const payload = files.length
    ? build({ ...CLIPCODE_DEFAULTS, files, sourceRoot: basename(rootPath) })
    : ''
  return {
    payload,
    copiedFileCount: files.length - skippedFileSizeCount,
    skippedFileSizeCount,
    unreadableFileCount,
    // A path skipped as binary in one area can still be copied from another.
    skippedBinaryFileCount: [...binaryPaths].filter((path) => !seen.has(path)).length,
    entryCount: files.length
  }
}
