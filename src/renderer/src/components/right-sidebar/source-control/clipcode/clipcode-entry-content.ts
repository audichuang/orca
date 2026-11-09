// Fork-only: content rules every ClipCode copy shares (non-text, size caps).
import { getRelativePathInsideRoot, joinPath } from '@/lib/path'
import { isWindowsAbsolutePathLike } from '../../../../../../shared/cross-platform-path'
import { getUtf8ByteLength, measureUtf8ByteLength } from '../../../../../../shared/utf8-byte-limits'
import type { GitDiffResult } from '../../../../../../shared/git/diff/git-diff-compare-types'
import {
  CLIPCODE_DEFAULTS,
  formatHeader,
  parseClipboard,
  type ChangeTypeLabel,
  type PayloadFile
} from './clipcode-clipboard-format'
import type { ClipcodeGitCopyResult } from './clipcode-git-copy'
import { NON_TEXT_BASE64_LINE_LENGTH } from './clipcode-non-text-body'
import { isClipcodePortableRelativePath } from './clipcode-portable-path'

/** A working file as read for a copy: raw bytes, its size when over both limits, or an old host's text read. */
export type ClipcodeFileRead =
  | { bytes: Uint8Array }
  | { tooLargeSize: number }
  | { content: string; isBinary: boolean }

/** Content from a source without raw bytes (index, HEAD, commits, an old host's text read). */
export type ClipcodeReadContent =
  | { text: string }
  /** `notRead`: over both per-file limits, so its kind is unknown. */
  | { skippedReason: string; notRead?: true }

/** A working file's content: raw bytes where the host can page them. */
export type ClipcodeFileContent = ClipcodeReadContent | { bytes: Uint8Array }

/** Read cap of a working file: past both limits it is not read at all. */
export const CLIPCODE_READ_MAX_BYTES =
  Math.max(CLIPCODE_DEFAULTS.maxFileSizeKB, CLIPCODE_DEFAULTS.maxNonTextFileSizeKB) * 1024

/** Whole-payload ceiling shared with OpenIDEA (`CLIPBOARD_PAYLOAD_MAX`); Include is refused above it. */
export const CLIPCODE_PAYLOAD_LIMIT_BYTES = 50 * 1024 * 1024

export function clipcodeReadContent(read: ClipcodeFileRead): ClipcodeFileContent | 'binary' {
  if ('bytes' in read) {
    return { bytes: read.bytes }
  }
  if ('tooLargeSize' in read) {
    return { skippedReason: `size exceeds limit (${read.tooLargeSize} bytes)`, notRead: true }
  }
  return read.isBinary ? 'binary' : { text: read.content }
}

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Text when the bytes hold no NUL and are strict UTF-8 (BOM kept); otherwise undefined. */
function decodeClipcodeText(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) {
    return undefined
  }
  try {
    return STRICT_UTF8.decode(bytes)
  } catch {
    return undefined
  }
}

type ClipcodeTextEntryVerdict =
  | { kind: 'file'; file: PayloadFile; sizeSkipped: boolean; notRead?: true }
  | { kind: 'binary' }
  | { kind: 'unreadable' }
  /** The file name would not parse back as itself (e.g. `[DELETED] x`, a newline), so restore could act on another path. */
  | { kind: 'unsafePath' }

export type ClipcodeEntryVerdict =
  | ClipcodeTextEntryVerdict
  /** Carried as Base64 only when the user picks Include. */
  | { kind: 'nonText'; file: PayloadFile & { bytes: Uint8Array } }

/**
 * True when an empty modified side is a failed read, not an empty file.
 * Commit diffs always send `missingSides` ([] = both read). Older hosts, and getDiff when both sides
 * exist, omit it; both sides empty then counts as unreadable, so an empty file's mode-only change is
 * skipped rather than risk copying a failed read as empty.
 */
export function isUnreadableModifiedSide(diff: GitDiffResult): boolean {
  if (diff.modifiedContent !== '') {
    return false
  }
  if (diff.missingSides) {
    return diff.missingSides.includes('modified')
  }
  // Why: a binary original is blanked, so its '' says nothing about the read.
  return diff.originalContent === '' && !diff.originalIsBinary
}

/** Root-relative with `/`; `\` is a separator only under a Windows root (on POSIX it is part of a name). */
export function clipcodeRootRelativePath(
  absolutePath: string,
  rootPath: string
): string | undefined {
  const relative = getRelativePathInsideRoot(absolutePath, rootPath)
  if (relative === null) {
    return undefined
  }
  return isWindowsAbsolutePathLike(rootPath) ? relative.replaceAll('\\', '/') : relative
}

/** Payload path of a git path (always `/`-separated, so a `\` in it is a POSIX name character). */
export function clipcodeGitClipboardPath(
  worktreePath: string,
  gitPath: string,
  rootPath: string
): string | undefined {
  const relative = clipcodeRootRelativePath(joinPath(worktreePath, gitPath), rootPath)
  if (relative === undefined || !gitPath.includes('\\')) {
    return relative
  }
  // Why: under a Windows root the name's own `\` became `/`; put it back so the name is skipped, not moved.
  const tail = Math.min(relative.length, gitPath.length)
  return relative.slice(0, relative.length - tail) + gitPath.slice(gitPath.length - tail)
}

/** True when a payload path restores as itself everywhere (OpenIDEA `is_exportable_relative_path`) and its header parses back. */
export function isClipcodeCopyablePath(
  path: string,
  changeType: ChangeTypeLabel | undefined
): boolean {
  return isClipcodePortableRelativePath(path) && clipcodeHeaderRoundTrips(path, changeType)
}

/** True when this path's header parses back to exactly this path and change label. */
export function clipcodeHeaderRoundTrips(
  path: string,
  changeType: ChangeTypeLabel | undefined
): boolean {
  // Why: Paste & Restore reads `\` as a separator, so a POSIX name holding one would land at another path.
  if (path.includes('\\')) {
    return false
  }
  const { headerFormat } = CLIPCODE_DEFAULTS
  const parsed = parseClipboard(formatHeader(headerFormat, path, changeType), headerFormat)
  const labels = parsed[0]?.changeTypes
  return (
    parsed.length === 1 &&
    parsed[0].path === path &&
    labels?.size === (changeType ? 1 : 0) &&
    (!changeType || labels.has(changeType))
  )
}

// Text-only content never yields a non-text verdict.
export function classifyClipcodeEntryContent(
  path: string,
  changeType: ChangeTypeLabel | undefined,
  content: ClipcodeReadContent,
  maxBytes: number
): ClipcodeTextEntryVerdict
export function classifyClipcodeEntryContent(
  path: string,
  changeType: ChangeTypeLabel | undefined,
  content: ClipcodeFileContent,
  maxBytes: number
): ClipcodeEntryVerdict
export function classifyClipcodeEntryContent(
  path: string,
  /** Undefined for a plain file copy, which carries no change label. */
  changeType: ChangeTypeLabel | undefined,
  content: ClipcodeFileContent,
  maxBytes: number
): ClipcodeEntryVerdict {
  if (!isClipcodeCopyablePath(path, changeType)) {
    return { kind: 'unsafePath' }
  }
  if ('skippedReason' in content) {
    return {
      kind: 'file',
      file: { path, changeType, skippedReason: content.skippedReason },
      sizeSkipped: true,
      ...(content.notRead ? { notRead: true } : {})
    }
  }
  if ('bytes' in content) {
    const text = decodeClipcodeText(content.bytes)
    if (text === undefined) {
      return content.bytes.length > CLIPCODE_DEFAULTS.maxNonTextFileSizeKB * 1024
        ? sizeSkippedVerdict(path, changeType, content.bytes.length)
        : { kind: 'nonText', file: { path, changeType, bytes: content.bytes } }
    }
    // Why: strict UTF-8 text; a U+FFFD here is a real character, not a lenient-decode trace.
    return content.bytes.length > maxBytes
      ? sizeSkippedVerdict(path, changeType, content.bytes.length)
      : { kind: 'file', file: { path, changeType, content: text }, sizeSkipped: false }
  }
  if (content.text.includes('\0')) {
    return { kind: 'binary' }
  }
  // Why: U+FFFD is what a lenient decode leaves of non-UTF-8 bytes; restoring it would corrupt the file (ClipCode does the same).
  if (changeType !== 'DELETED' && content.text.includes('�')) {
    return { kind: 'unreadable' }
  }
  if (measureUtf8ByteLength(content.text, { stopAfterBytes: maxBytes }).exceededLimit) {
    return sizeSkippedVerdict(path, changeType, getUtf8ByteLength(content.text))
  }
  return { kind: 'file', file: { path, changeType, content: content.text }, sizeSkipped: false }
}

function sizeSkippedVerdict(
  path: string,
  changeType: ChangeTypeLabel | undefined,
  size: number
): ClipcodeTextEntryVerdict {
  return {
    kind: 'file',
    file: { path, changeType, skippedReason: `size exceeds limit (${size} bytes)` },
    sizeSkipped: true
  }
}

/** What the copy dialog shows, all taken from the Include result. */
export type ClipcodeNonTextSummary = {
  count: number
  totalBytes: number
  /** Payload order. */
  files: { path: string; size: number }[]
  /** UTF-8 bytes of the Include payload, or its lower bound when that is already over the limit (payload not built). */
  includePayloadBytes: number
  /** Over both per-file limits, so not read (kind unknown); copied as size placeholders. */
  unreadOverLimitCount: number
}

/** One copy mode's running result: Exclude (today's payload) or Include (non-text files carried). */
export class ClipcodeCopyTally {
  readonly files: PayloadFile[] = []
  /** Payload paths already copied; a later row of the same path is not read again. */
  readonly seen = new Set<string>()
  private readonly unreadablePaths: string[] = []
  private readonly unsafePaths = new Set<string>()
  private readonly nonTextPaths = new Set<string>()
  private readonly symlinkedFolderPaths: string[] = []
  private sizeSkippedCount = 0
  private notReadCount = 0

  constructor(private readonly includeNonText: boolean) {}

  add(path: string, verdict: ClipcodeEntryVerdict): void {
    switch (verdict.kind) {
      case 'binary':
        this.nonTextPaths.add(path)
        return
      case 'nonText':
        if (this.includeNonText) {
          this.accept(verdict.file, false)
        } else {
          this.nonTextPaths.add(path)
        }
        return
      case 'unsafePath':
        this.unsafePaths.add(path)
        return
      case 'unreadable':
        this.addUnreadable(path)
        return
      case 'file':
        this.accept(verdict.file, verdict.sizeSkipped)
        this.notReadCount += verdict.notRead ? 1 : 0
    }
  }

  addUnreadable(path: string): void {
    this.unreadablePaths.push(path)
  }

  addSymlinkedFolder(path: string): void {
    this.symlinkedFolderPaths.push(path)
  }

  private accept(file: PayloadFile, sizeSkipped: boolean): void {
    this.seen.add(file.path)
    this.files.push(file)
    this.sizeSkippedCount += sizeSkipped ? 1 : 0
  }

  result(build: (files: PayloadFile[]) => string): ClipcodeGitCopyResult {
    const { files } = this
    return {
      payload: files.length ? build(files) : '',
      copiedFileCount: files.length - this.sizeSkippedCount,
      skippedFileSizeCount: this.sizeSkippedCount,
      unreadableFileCount: this.unreadablePaths.length,
      unreadablePaths: this.unreadablePaths,
      // A path skipped as non-text in one area can still be copied from another.
      skippedBinaryFileCount: [...this.nonTextPaths].filter((path) => !this.seen.has(path)).length,
      skippedUnsafePathCount: this.unsafePaths.size,
      unsafePaths: [...this.unsafePaths],
      symlinkedFolderPaths: this.symlinkedFolderPaths,
      nonTextFileCount: files.filter((file) => file.bytes).length,
      entryCount: files.length
    }
  }

  /** The Exclude result, plus the Include result and its dialog summary when Include carries non-text files. */
  static withNonTextChoice(
    exclude: ClipcodeGitCopyResult,
    include: ClipcodeCopyTally,
    build: (files: PayloadFile[]) => string
  ): ClipcodeGitCopyResult {
    const carried = include.files.filter((file) => file.bytes)
    if (carried.length === 0) {
      return exclude
    }
    const sizes = carried.map((file) => ({ path: file.path, size: file.bytes?.length ?? 0 }))
    // Why: the Base64 lines alone can already pass the limit; building that string can exceed V8's max length.
    const base64LowerBound = sizes.reduce((total, file) => {
      const encoded = Math.ceil(file.size / 3) * 4
      return total + encoded + Math.ceil(encoded / NON_TEXT_BASE64_LINE_LENGTH)
    }, 0)
    const overLimit = base64LowerBound > CLIPCODE_PAYLOAD_LIMIT_BYTES
    const includeResult = include.result(overLimit ? () => '' : build)
    return {
      ...exclude,
      nonText: {
        include: includeResult,
        summary: {
          count: carried.length,
          totalBytes: sizes.reduce((total, file) => total + file.size, 0),
          files: sizes,
          includePayloadBytes: overLimit
            ? base64LowerBound
            : getUtf8ByteLength(includeResult.payload),
          unreadOverLimitCount: include.notReadCount
        }
      }
    }
  }
}
