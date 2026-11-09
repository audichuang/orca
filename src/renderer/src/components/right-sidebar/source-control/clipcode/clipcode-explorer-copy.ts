// Fork-only: ClipCode "Copy to Clipboard" for file explorer selections (files and whole folders).
import { basename, getRelativePathInsideRoot, joinPath } from '@/lib/path'
import type { DirEntry } from '../../../../../../shared/file-listing/directory-entry'
import { sortDirEntries } from '../../../../../../shared/file-listing/file-name-sort'
import { mapWithConcurrency } from '../../../../../../shared/map-with-concurrency'
import { isWindowsAbsolutePathLike } from '../../../../../../shared/cross-platform-path'
import { isPathOutsideAllowedDirectoriesError } from '../../../../../../shared/file-access/local-file-access'
import { shouldIncludeFileExplorerEntry } from '../../file-explorer/tree/file-explorer-entries'
import { buildPayload, CLIPCODE_DEFAULTS, type PayloadFile } from './clipcode-clipboard-format'
import {
  classifyClipcodeEntryContent,
  clipcodeHeaderRoundTrips,
  clipcodeReadContent,
  ClipcodeCopyTally,
  type ClipcodeEntryVerdict,
  type ClipcodeFileRead,
  type ClipcodeFileContent
} from './clipcode-entry-content'
import type { ClipcodeGitCopyResult } from './clipcode-git-copy'
import { isClipcodePortableRelativePath } from './clipcode-portable-path'

/** `isSymlink`: an explorer row of a symlink; a symlinked folder is named, never followed. */
export type ClipcodeExplorerTarget = { path: string; isDirectory: boolean; isSymlink?: boolean }

export type ClipcodeExplorerReaders = {
  readDir: (absolutePath: string) => Promise<DirEntry[]>
  readFile: (absolutePath: string) => Promise<ClipcodeFileRead>
}

// Why: same ceiling as the history copy; the runtime RPC queue rejects past 256 in flight.
const READ_CONCURRENCY = 6

// Local reads refuse past the editor cap, remote previews past theirs; both are size skips, not failures.
// Why includes, not startsWith: a main-process error reaches the renderer wrapped as "Error invoking remote method …".
const TOO_LARGE_ERRORS = ['File too large', 'Remote file is too large']
// A symlinked folder listed while folder-following is off reads as "not a file".
const NOT_A_FILE_ERRORS = ['Not a regular file', 'EISDIR']

async function readContent(
  readers: ClipcodeExplorerReaders,
  absolutePath: string
): Promise<ClipcodeFileContent | 'binary' | 'unreadable' | 'notAFile' | 'outsideRoots'> {
  try {
    return clipcodeReadContent(await readers.readFile(absolutePath))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (TOO_LARGE_ERRORS.some((text) => message.includes(text))) {
      return { skippedReason: 'size exceeds limit' }
    }
    if (isPathOutsideAllowedDirectoriesError(error)) {
      return 'outsideRoots'
    }
    return NOT_A_FILE_ERRORS.some((text) => message.includes(text)) ? 'notAFile' : 'unreadable'
  }
}

/** Root-relative with `/`; `\` is a separator only under a Windows root (on POSIX it is part of a name). */
function rootRelativePath(absolutePath: string, rootPath: string): string | undefined {
  const relative = getRelativePathInsideRoot(absolutePath, rootPath)
  if (relative === null) {
    return undefined
  }
  return isWindowsAbsolutePathLike(rootPath) ? relative.replaceAll('\\', '/') : relative
}

/** Shown path of a skipped item: workspace-relative like the payload, else as given. */
function displayPath(absolutePath: string, rootPath: string): string {
  return rootRelativePath(absolutePath, rootPath) || absolutePath
}

type CollectedFile = { path: string; isSymlink: boolean }

/** Depth-first in explorer order; hidden entries (.git, node_modules) are skipped, symlinked folders named. */
async function collectFilePaths(
  readers: ClipcodeExplorerReaders,
  targets: readonly ClipcodeExplorerTarget[]
): Promise<{ files: CollectedFile[]; unreadableDirs: string[]; symlinkedFolders: string[] }> {
  const files: CollectedFile[] = []
  const seen = new Set<string>()
  const unreadableDirs: string[] = []
  const symlinkedFolders: string[] = []
  const visit = async (target: ClipcodeExplorerTarget): Promise<void> => {
    if (seen.has(target.path)) {
      return
    }
    seen.add(target.path)
    if (!target.isDirectory) {
      files.push({ path: target.path, isSymlink: target.isSymlink === true })
      return
    }
    // Why: a symlinked folder can point back at an ancestor; ClipCode/Snipcode never descend into one.
    if (target.isSymlink) {
      symlinkedFolders.push(target.path)
      return
    }
    let entries: DirEntry[]
    try {
      entries = sortDirEntries(await readers.readDir(target.path))
    } catch {
      unreadableDirs.push(target.path)
      return
    }
    for (const entry of entries) {
      if (shouldIncludeFileExplorerEntry(entry)) {
        await visit({
          path: joinPath(target.path, entry.name),
          isDirectory: entry.isDirectory,
          isSymlink: entry.isSymlink
        })
      }
    }
  }
  for (const target of targets) {
    await visit(target)
  }
  return { files, unreadableDirs, symlinkedFolders }
}

type ExplorerFileVerdict = ClipcodeEntryVerdict | { kind: 'notAFile' } | { kind: 'outsideRoots' }

/** Reads and classifies one file; only an accepted file keeps its content, so a big selection never piles up rejected bodies. */
async function readAndClassify(
  readers: ClipcodeExplorerReaders,
  clipboardPath: string | undefined,
  absolutePath: string,
  maxBytes: number
): Promise<ExplorerFileVerdict> {
  if (!clipboardPath) {
    return { kind: 'unreadable' }
  }
  // Why first: an unsafe name is skipped without reading its bytes at all.
  if (
    !isClipcodePortableRelativePath(clipboardPath) ||
    !clipcodeHeaderRoundTrips(clipboardPath, undefined)
  ) {
    return { kind: 'unsafePath' }
  }
  const content = await readContent(readers, absolutePath)
  if (
    content === 'binary' ||
    content === 'unreadable' ||
    content === 'notAFile' ||
    content === 'outsideRoots'
  ) {
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
  const collected = await collectFilePaths(readers, args.targets)
  const verdicts = await mapWithConcurrency(collected.files, READ_CONCURRENCY, (file) =>
    readAndClassify(readers, rootRelativePath(file.path, rootPath), file.path, maxBytes)
  )
  const tallies = [new ClipcodeCopyTally(false), new ClipcodeCopyTally(true)] as const
  for (const tally of tallies) {
    for (const dir of collected.unreadableDirs) {
      tally.addUnreadable(displayPath(dir, rootPath))
    }
    for (const dir of collected.symlinkedFolders) {
      tally.addSymlinkedFolder(displayPath(dir, rootPath))
    }
    verdicts.forEach((verdict, index) => {
      const { path, isSymlink } = collected.files[index]
      const shown = displayPath(path, rootPath)
      if (verdict.kind === 'notAFile') {
        // A symlinked folder listed as a file while folder-following is off; any other non-file stays silent.
        if (isSymlink) {
          tally.addSymlinkedFolder(shown)
        }
      } else if (verdict.kind === 'outsideRoots') {
        // Why: a symlink leaving the allowed folders lists as a file whatever it points at; it is never followed.
        if (isSymlink) {
          tally.addSymlinkedFolder(shown)
        } else {
          tally.addUnreadable(shown)
        }
      } else {
        tally.add(shown, verdict)
      }
    })
  }
  const build = (files: PayloadFile[]): string =>
    buildPayload({ ...CLIPCODE_DEFAULTS, files, sourceRoot: basename(rootPath) })
  return ClipcodeCopyTally.withNonTextChoice(tallies[0].result(build), tallies[1], build)
}
