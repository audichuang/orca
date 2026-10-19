// Fork-only: ClipCode "Copy to Clipboard" for file explorer selections (files and whole folders).
import { basename, getRelativePathInsideRoot, joinPath } from '@/lib/path'
import type { DirEntry } from '../../../../../../shared/filesystem-entry-types'
import { sortDirEntries } from '../../../../../../shared/file-name-sort'
import { mapWithConcurrency } from '../../../../../../shared/map-with-concurrency'
import { shouldIncludeFileExplorerEntry } from '../../file-explorer-entries'
import { buildPayload, CLIPCODE_DEFAULTS, type PayloadFile } from './clipcode-clipboard-format'
import {
  classifyClipcodeEntryContent,
  clipcodeHeaderRoundTrips,
  type ClipcodeEntryVerdict,
  type ClipcodeReadContent
} from './clipcode-entry-content'
import type { ClipcodeGitCopyResult } from './clipcode-git-copy'

export type ClipcodeExplorerTarget = { path: string; isDirectory: boolean }

export type ClipcodeExplorerReaders = {
  readDir: (absolutePath: string) => Promise<DirEntry[]>
  readFile: (absolutePath: string) => Promise<{ content: string; isBinary: boolean }>
}

// Why: same ceiling as the history copy; the runtime RPC queue rejects past 256 in flight.
// ponytail: a worker still holds one whole read (local cap 50 MB) before the 500 KB check; a size-capped read API would remove that peak.
const READ_CONCURRENCY = 6

// Local reads refuse past the editor cap, remote previews past theirs; both are size skips, not failures.
// Why includes, not startsWith: a main-process error reaches the renderer wrapped as "Error invoking remote method …".
const TOO_LARGE_ERRORS = ['File too large', 'Remote file is too large']
// A symlinked folder listed while folder-following is off reads as "not a file"; ClipCode skips it silently.
const NOT_A_FILE_ERRORS = ['Not a regular file', 'EISDIR']

async function readContent(
  readers: ClipcodeExplorerReaders,
  absolutePath: string
): Promise<ClipcodeReadContent | 'binary' | 'unreadable' | 'notAFile'> {
  try {
    const file = await readers.readFile(absolutePath)
    return file.isBinary ? 'binary' : { text: file.content }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (TOO_LARGE_ERRORS.some((text) => message.includes(text))) {
      return { skippedReason: 'size exceeds limit' }
    }
    return NOT_A_FILE_ERRORS.some((text) => message.includes(text)) ? 'notAFile' : 'unreadable'
  }
}

/** Depth-first in explorer order; hidden entries (.git, node_modules) and nested symlinked folders are skipped. */
async function collectFilePaths(
  readers: ClipcodeExplorerReaders,
  targets: readonly ClipcodeExplorerTarget[]
): Promise<{ paths: string[]; unreadableDirCount: number }> {
  const paths: string[] = []
  const seen = new Set<string>()
  let unreadableDirCount = 0
  const visit = async (target: ClipcodeExplorerTarget): Promise<void> => {
    if (seen.has(target.path)) {
      return
    }
    seen.add(target.path)
    if (!target.isDirectory) {
      paths.push(target.path)
      return
    }
    let entries: DirEntry[]
    try {
      entries = sortDirEntries(await readers.readDir(target.path))
    } catch {
      unreadableDirCount++
      return
    }
    for (const entry of entries) {
      // Why: a symlinked folder can point back at an ancestor; ClipCode/Snipcode never descend into one.
      if (!shouldIncludeFileExplorerEntry(entry) || (entry.isDirectory && entry.isSymlink)) {
        continue
      }
      await visit({ path: joinPath(target.path, entry.name), isDirectory: entry.isDirectory })
    }
  }
  for (const target of targets) {
    await visit(target)
  }
  return { paths, unreadableDirCount }
}

type ExplorerFileVerdict =
  | ClipcodeEntryVerdict
  | { kind: 'binary' }
  | { kind: 'unreadable' }
  | { kind: 'notAFile' }

/** Reads and classifies one file; only an accepted file keeps its text, so a big selection never piles up rejected bodies. */
async function readAndClassify(
  readers: ClipcodeExplorerReaders,
  rootPath: string,
  absolutePath: string,
  maxBytes: number
): Promise<ExplorerFileVerdict> {
  const clipboardPath = getRelativePathInsideRoot(absolutePath, rootPath)?.replaceAll('\\', '/')
  if (!clipboardPath) {
    return { kind: 'unreadable' }
  }
  // Why first: an unsafe name is skipped without reading its bytes at all.
  if (!clipcodeHeaderRoundTrips(clipboardPath, undefined)) {
    return { kind: 'unsafePath' }
  }
  const content = await readContent(readers, absolutePath)
  if (content === 'binary' || content === 'unreadable' || content === 'notAFile') {
    return { kind: content }
  }
  return classifyClipcodeEntryContent(clipboardPath, undefined, content, maxBytes)
}

/** Builds the Snipcode payload for explorer targets; paths are relative to `rootPath`, like Paste & Restore. */
export async function buildClipcodeExplorerCopy(args: {
  rootPath: string
  targets: readonly ClipcodeExplorerTarget[]
  readers: ClipcodeExplorerReaders
}): Promise<ClipcodeGitCopyResult> {
  const { rootPath, readers } = args
  const maxBytes = CLIPCODE_DEFAULTS.maxFileSizeKB * 1024
  const { paths, unreadableDirCount } = await collectFilePaths(readers, args.targets)
  const verdicts = await mapWithConcurrency(paths, READ_CONCURRENCY, (path) =>
    readAndClassify(readers, rootPath, path, maxBytes)
  )
  const files: PayloadFile[] = []
  let skippedFileSizeCount = 0
  let skippedBinaryFileCount = 0
  let skippedUnsafePathCount = 0
  let unreadableFileCount = unreadableDirCount
  for (const verdict of verdicts) {
    if (verdict.kind === 'notAFile') {
      continue
    }
    if (verdict.kind === 'binary') {
      skippedBinaryFileCount++
    } else if (verdict.kind === 'unreadable') {
      unreadableFileCount++
    } else if (verdict.kind === 'unsafePath') {
      skippedUnsafePathCount++
    } else {
      skippedFileSizeCount += verdict.sizeSkipped ? 1 : 0
      files.push(verdict.file)
    }
  }
  return {
    payload: files.length
      ? buildPayload({ ...CLIPCODE_DEFAULTS, files, sourceRoot: basename(rootPath) })
      : '',
    copiedFileCount: files.length - skippedFileSizeCount,
    skippedFileSizeCount,
    unreadableFileCount,
    skippedBinaryFileCount,
    skippedUnsafePathCount,
    entryCount: files.length
  }
}
