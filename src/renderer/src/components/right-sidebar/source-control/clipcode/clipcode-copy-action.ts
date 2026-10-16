import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getConnectionId } from '@/lib/connection-context'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { joinPath } from '@/lib/path'
import { getRuntimeGitDiff } from '@/runtime/runtime-git-diff-client'
import type { RuntimeGitContext } from '@/runtime/runtime-git-client-context'
import { readRuntimeFileContent } from '@/runtime/runtime-file-read-client'
import { useAppStore } from '@/store'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeGitOwnerTarget, requireGitOwnerTarget } from '../../worktree-git-owner-target'
import {
  buildClipcodeGitCopy,
  type ClipcodeContentReaders,
  type ClipcodeCopyRepo
} from './clipcode-git-copy'
import {
  CLIPCODE_TOKEN_DANGER_THRESHOLD,
  CLIPCODE_TOKEN_WARN_THRESHOLD,
  formatClipcodeCount,
  formatClipcodeStatsLine,
  payloadStats
} from './clipcode-payload-stats'

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

export const clipcodeRuntimeReaders: ClipcodeContentReaders = {
  readDiff: getRuntimeGitDiff,
  readWorkingFile: async (context, relativePath) => {
    const file = await readRuntimeFileContent({
      target: context.target,
      filePath: joinPath(context.worktreePath, relativePath),
      relativePath,
      worktreeId: context.worktreeId ?? undefined,
      connectionId: context.connectionId
    })
    return { content: file.content, isBinary: file.isBinary }
  }
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
    if (result.entryCount === 0 && result.unreadableFileCount > 0) {
      toast.error(
        translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.9c3f952874',
          '{{value0}} Git file(s) could not be read.',
          {
            value0: result.unreadableFileCount
          }
        )
      )
      return
    }
    if (result.entryCount === 0) {
      toast.warning(
        translate(
          'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.21758e255e',
          'No Git changes found to copy.'
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
    notifyCopied(
      `${translate(
        'auto.components.right.sidebar.source.control.clipcode.clipcode.copy.action.65b422bbd1',
        '{{value0}} Git file(s) copied',
        { value0: result.copiedFileCount }
      )}${skipped}${unreadable}.`,
      result.payload
    )
  } catch (error) {
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
}
