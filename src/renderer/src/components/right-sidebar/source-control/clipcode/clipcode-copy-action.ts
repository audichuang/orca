import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { readIpcErrorMessage } from '@/runtime/errors/ipc-error'
import { getRelativePathInsideRoot, joinPath } from '@/lib/path'
import {
  getRuntimeGitCommitDiff,
  getRuntimeGitDiff
} from '@/runtime/source-control/git/runtime-git-diff-client'
import type { RuntimeGitContext } from '@/runtime/source-control/git/runtime-git-client-context'
import { readRuntimeFileContent } from '@/runtime/files/reads/runtime-file-read-client'
import { readRuntimeFileBytes } from '@/runtime/files/reads/runtime-paged-file-read'
import { readRuntimeDirectory } from '@/runtime/files/reads/runtime-directory-read'
import { useAppStore } from '@/store'
import { isPathInsideOrEqual } from '../../../../../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeGitOwnerTarget, requireGitOwnerTarget } from '../sync/worktree-git-owner-target'
import {
  getFileExplorerOperationOwner,
  getFileExplorerOperationRoute,
  getFileExplorerOwnerUnresolvedMessage
} from '../../file-explorer/navigation/file-explorer-operation-owner'
import {
  buildClipcodeGitCopy,
  type ClipcodeContentReaders,
  type ClipcodeCopyRepo,
  type ClipcodeGitCopyResult
} from './clipcode-git-copy'
import {
  buildClipcodeCommitCopy,
  type ClipcodeCommitCopyCommit,
  type ClipcodeCommitReaders
} from './clipcode-commit-copy'
import { clipcodeCopyNotes, notifyClipcodeCopied } from './clipcode-copied-toast'
import { CLIPCODE_READ_MAX_BYTES, type ClipcodeFileRead } from './clipcode-entry-content'
import { askClipcodeNonTextChoice } from './clipcode-non-text-copy-dialog'
import { svgPreviewText } from './clipcode-svg-text'
import {
  buildClipcodeExplorerCopy,
  type ClipcodeExplorerReaders,
  type ClipcodeExplorerTarget
} from './clipcode-explorer-copy'
import { selectFolderWorkspaces } from '@/store/workspaces/catalog/workspace-record-fields'

export type ClipcodeCopyRequest = {
  worktree: Pick<Worktree, 'id' | 'path'>
  entries: readonly GitStatusEntry[]
  forceIndexForStaged: boolean
}

export function getClipcodeRepoContext(worktree: Pick<Worktree, 'id' | 'path'>): RuntimeGitContext {
  return {
    target: requireGitOwnerTarget(getWorktreeGitOwnerTarget(worktree.id)),
    worktreeId: worktree.id,
    worktreePath: worktree.path,
    connectionId: getConnectionId(worktree.id) ?? undefined
  }
}

/** Copy root: the folder workspace for a scoped folder panel when the worktree lies inside it or contains it, else the worktree itself. */
export function getClipcodeRootPath(editorWorktreeId: string | null, worktreePath: string): string {
  const scope = editorWorktreeId ? parseWorkspaceKey(editorWorktreeId) : null
  if (scope?.type !== 'folder') {
    return worktreePath
  }
  const folder = selectFolderWorkspaces(useAppStore.getState()).find(
    (workspace) => workspace.id === scope.folderWorkspaceId
  )
  return folder &&
    (isPathInsideOrEqual(folder.folderPath, worktreePath) ||
      isPathInsideOrEqual(worktreePath, folder.folderPath))
    ? folder.folderPath
    : worktreePath
}

// Copy Full Source is the user's own act, so its reads may start a stopped WSL distro (E9).
const USER_ACT = { wakeWslDistro: true } as const

/** Raw bytes, so non-text files can be carried; an old host without paged reads gets today's text read. */
async function readClipcodeFile(
  context: RuntimeGitContext,
  relativePath: string
): Promise<ClipcodeFileRead> {
  const args = {
    target: context.target,
    filePath: joinPath(context.worktreePath, relativePath),
    relativePath,
    worktreeId: context.worktreeId ?? undefined,
    connectionId: context.connectionId,
    ...USER_ACT
  }
  try {
    const read = await readRuntimeFileBytes(args, CLIPCODE_READ_MAX_BYTES)
    if (read.kind === 'ok') {
      return { bytes: read.bytes }
    }
    if (read.kind === 'too_large') {
      return { tooLargeSize: read.size }
    }
  } catch {
    // Why: the text read below keeps today's error wording (unreadable, not a file, too large), and
    // unlike the byte read's stat it may wake a stopped WSL distro.
  }
  const file = await readRuntimeFileContent(args)
  const svgText = svgPreviewText(file)
  return svgText === null
    ? { content: file.content, isBinary: file.isBinary }
    : { content: svgText, isBinary: false }
}

export const clipcodeRuntimeReaders: ClipcodeContentReaders = {
  readDiff: (context, args) => getRuntimeGitDiff(context, args, USER_ACT),
  readWorkingFile: readClipcodeFile
}

export const clipcodeCommitReaders: ClipcodeCommitReaders = {
  readCommitDiff: (context, args) => getRuntimeGitCommitDiff(context, args, USER_ACT)
}

export function clipcodeExplorerReaders(
  context: RuntimeGitContext,
  followSymlinks: boolean
): ClipcodeExplorerReaders {
  return {
    readDir: (absolutePath) =>
      readRuntimeDirectory(context, absolutePath, {
        ...(followSymlinks ? { followSymlinks: true } : {}),
        ...USER_ACT
      }),
    readFile: async (absolutePath) => {
      const relativePath = getRelativePathInsideRoot(absolutePath, context.worktreePath)
      if (relativePath === null) {
        throw new Error('File is outside the workspace')
      }
      return readClipcodeFile(context, relativePath)
    }
  }
}

/** Builds the Snipcode payload for the given repos, puts it on the clipboard and reports its size. */
export async function copyClipcodeGitChanges(args: {
  rootPath: string
  requests: readonly ClipcodeCopyRequest[]
}): Promise<void> {
  try {
    const repos: ClipcodeCopyRepo[] = args.requests.map((request) => ({
      context: getClipcodeRepoContext(request.worktree),
      entries: request.entries,
      forceIndexForStaged: request.forceIndexForStaged
    }))
    const result = await buildClipcodeGitCopy({
      rootPath: args.rootPath,
      repos,
      readers: clipcodeRuntimeReaders
    })
    await reportClipcodeCopyResult(result)
  } catch (error) {
    notifyCopyFailed(error)
  }
}

/** Asks about non-text files first, then writes the clipboard and reports, so every Copy Full Source source reports alike. */
async function reportClipcodeCopyResult(
  excludeResult: ClipcodeGitCopyResult,
  source: 'git' | 'files' = 'git'
): Promise<void> {
  let result = excludeResult
  if (excludeResult.nonText) {
    const choice = await askClipcodeNonTextChoice(excludeResult.nonText.summary)
    if (choice === 'cancel') {
      return
    }
    if (choice === 'include') {
      result = excludeResult.nonText.include
    }
  }
  if (result.entryCount === 0 && result.unreadableFileCount > 0) {
    toast.error(
      source === 'git'
        ? translate(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.9c3f952874',
            '{{value0}} Git file(s) could not be read.',
            {
              value0: result.unreadableFileCount
            }
          )
        : translate(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.filesUnreadable',
            '{{value0}} file(s) could not be read.',
            { value0: result.unreadableFileCount }
          )
    )
    return
  }
  if (result.entryCount === 0) {
    toast.warning(
      result.skippedUnsafePathCount > 0
        ? translate(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.onlyUnsafeNamesSkipped',
            'Nothing to copy: {{value0}} file(s) skipped because their names cannot be restored safely.',
            { value0: result.skippedUnsafePathCount }
          )
        : result.skippedBinaryFileCount > 0
          ? translate(
              'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.onlyNonTextSkipped',
              'Nothing to copy: {{value0}} non-text file(s) skipped.',
              { value0: result.skippedBinaryFileCount }
            )
          : source === 'git'
            ? translate(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.21758e255e',
                'No Git changes found to copy.'
              )
            : translate(
                'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.noFiles',
                'No files found to copy.'
              )
    )
    return
  }
  await window.api.ui.writeClipboardText(result.payload)
  const notes = clipcodeCopyNotes(result)
  const copied =
    source === 'git'
      ? translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.65b422bbd1',
          '{{value0}} Git file(s) copied',
          { value0: result.copiedFileCount }
        )
      : translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.filesCopied',
          '{{value0}} file(s) copied',
          { value0: result.copiedFileCount }
        )
  notifyClipcodeCopied(copied, notes, result.payload)
}

function notifyCopyFailed(error: unknown): void {
  toast.error(
    translate(
      'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.7c6daaf4fa',
      'Copy Full Source failed'
    ),
    {
      description: readIpcErrorMessage(error)
    }
  )
}

/** Copy Full Source for one or more commits of one repo, newest first (newest commit wins per path). */
export async function copyClipcodeCommitChanges(args: {
  rootPath: string
  context: RuntimeGitContext
  loadCommits: () => Promise<ClipcodeCommitCopyCommit[]>
}): Promise<void> {
  try {
    const result = await buildClipcodeCommitCopy({
      rootPath: args.rootPath,
      context: args.context,
      commits: await args.loadCommits(),
      readers: clipcodeCommitReaders
    })
    await reportClipcodeCopyResult(result)
  } catch (error) {
    notifyCopyFailed(error)
  }
}

/** ClipCode "Copy to Clipboard" for the active workspace's explorer rows; folders are copied recursively. */
export async function copyClipcodeExplorerTargets(args: {
  worktreePath: string
  targets: readonly ClipcodeExplorerTarget[]
}): Promise<void> {
  try {
    const { worktreePath } = args
    const worktreeId = useAppStore.getState().activeWorktreeId
    if (!worktreeId) {
      throw new Error(getFileExplorerOwnerUnresolvedMessage())
    }
    // Why: resolve the owner once so every directory walk and read of this copy lands on one host.
    const route = getFileExplorerOperationRoute(getFileExplorerOperationOwner(worktreeId))
    if (!route) {
      throw new Error(getFileExplorerOwnerUnresolvedMessage())
    }
    const context: RuntimeGitContext = {
      target: route.target,
      worktreeId,
      worktreePath,
      connectionId: route.connectionId
    }
    const followSymlinks = useAppStore.getState().settings?.followSymlinkedDirectories === true
    const result = await buildClipcodeExplorerCopy({
      rootPath: worktreePath,
      targets: args.targets,
      readers: clipcodeExplorerReaders(context, followSymlinks)
    })
    await reportClipcodeCopyResult(result, 'files')
  } catch (error) {
    notifyCopyFailed(error)
  }
}
