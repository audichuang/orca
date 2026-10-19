import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/connection-context'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { getRelativePathInsideRoot, joinPath } from '@/lib/path'
import { getRuntimeGitCommitDiff, getRuntimeGitDiff } from '@/runtime/runtime-git-diff-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { readRuntimeFileContent } from '@/runtime/runtime-file-read-client'
import { readRuntimeDirectory } from '@/runtime/runtime-file-mutation-client'
import { useAppStore } from '@/store'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeGitOwnerTarget, requireGitOwnerTarget } from '../../worktree-git-owner-target'
import {
  getFileExplorerOperationOwner,
  getFileExplorerOperationRoute,
  getFileExplorerOwnerUnresolvedMessage
} from '../../file-explorer-operation-owner'
import {
  buildClipcodeGitCopy,
  type ClipcodeContentReaders,
  type ClipcodeCopyRepo,
  type ClipcodeGitCopyResult
} from './clipcode-git-copy'
import { buildClipcodeCommitCopy, type ClipcodeCommitCopyCommit } from './clipcode-commit-copy'
import {
  CLIPCODE_TOKEN_DANGER_THRESHOLD,
  CLIPCODE_TOKEN_WARN_THRESHOLD,
  formatClipcodeCount,
  formatClipcodeStatsLine,
  payloadStats
} from './clipcode-payload-stats'
import { svgPreviewText } from './clipcode-svg-text'
import { buildClipcodeExplorerCopy, type ClipcodeExplorerTarget } from './clipcode-explorer-copy'

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

/** Copy root: the folder workspace for a scoped folder panel, else the worktree itself. */
export function getClipcodeRootPath(editorWorktreeId: string | null, worktreePath: string): string {
  const scope = editorWorktreeId ? parseWorkspaceKey(editorWorktreeId) : null
  if (scope?.type !== 'folder') {
    return worktreePath
  }
  const folder = useAppStore
    .getState()
    .folderWorkspaces.find((workspace) => workspace.id === scope.folderWorkspaceId)
  return folder?.folderPath ?? worktreePath
}

async function readClipcodeFile(
  context: RuntimeGitContext,
  relativePath: string
): Promise<{ content: string; isBinary: boolean }> {
  const file = await readRuntimeFileContent({
    target: context.target,
    filePath: joinPath(context.worktreePath, relativePath),
    relativePath,
    worktreeId: context.worktreeId ?? undefined,
    connectionId: context.connectionId
  })
  const svgText = svgPreviewText(file)
  return svgText === null
    ? { content: file.content, isBinary: file.isBinary }
    : { content: svgText, isBinary: false }
}

export const clipcodeRuntimeReaders: ClipcodeContentReaders = {
  readDiff: getRuntimeGitDiff,
  readWorkingFile: readClipcodeFile
}

function notifyCopied(message: string, payload: string): void {
  const stats = payloadStats(payload)
  const note = `${message} ${formatClipcodeStatsLine(stats)}`
  if (stats.tokens >= CLIPCODE_TOKEN_DANGER_THRESHOLD) {
    toast.error(
      `${note} ${translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.e6cdc3a753',
        'Over {{value0}} tokens.',
        { value0: formatClipcodeCount(CLIPCODE_TOKEN_DANGER_THRESHOLD) }
      )}`,
      { duration: Infinity }
    )
  } else if (stats.tokens >= CLIPCODE_TOKEN_WARN_THRESHOLD) {
    toast.warning(
      `${note} ${translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.e6cdc3a753',
        'Over {{value0}} tokens.',
        { value0: formatClipcodeCount(CLIPCODE_TOKEN_WARN_THRESHOLD) }
      )}`,
      { duration: Infinity }
    )
  } else {
    toast(note, { duration: 2000 })
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

/** Clipboard write plus the shared toast wording, so every Copy Full Source source reports alike. */
async function reportClipcodeCopyResult(
  result: ClipcodeGitCopyResult,
  source: 'git' | 'files' = 'git'
): Promise<void> {
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
      result.skippedBinaryFileCount > 0
        ? translate(
            'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.onlyBinarySkipped',
            'Nothing to copy: {{value0}} binary file(s) skipped.',
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
  const skipped =
    result.skippedFileSizeCount > 0
      ? ` ${translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.7828c565da',
          '({{value0}} skipped: size exceeded)',
          { value0: result.skippedFileSizeCount }
        )}`
      : ''
  const unreadable =
    result.unreadableFileCount > 0
      ? ` ${translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.2749202819',
          '({{value0}} unreadable)',
          { value0: result.unreadableFileCount }
        )}`
      : ''
  const binary =
    result.skippedBinaryFileCount > 0
      ? ` ${translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.binarySkipped',
          '({{value0}} skipped: binary)',
          { value0: result.skippedBinaryFileCount }
        )}`
      : ''
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
  notifyCopied(`${copied}${skipped}${binary}${unreadable}.`, result.payload)
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
      readers: { readCommitDiff: getRuntimeGitCommitDiff }
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
      readers: {
        readDir: (absolutePath) =>
          readRuntimeDirectory(
            context,
            absolutePath,
            followSymlinks ? { followSymlinks: true } : undefined
          ),
        readFile: async (absolutePath) => {
          const relativePath = getRelativePathInsideRoot(absolutePath, worktreePath)
          if (relativePath === null) {
            throw new Error('File is outside the workspace')
          }
          return readClipcodeFile(context, relativePath)
        }
      }
    })
    await reportClipcodeCopyResult(result, 'files')
  } catch (error) {
    notifyCopyFailed(error)
  }
}
