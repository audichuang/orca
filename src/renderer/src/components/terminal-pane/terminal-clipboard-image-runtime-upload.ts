import type { ExternalToast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import {
  getRuntimeEnvironmentIdForWorktree,
  getSettingsForWorktreeRuntimeOwner,
  type WorktreeRuntimeOwnerState
} from '@/lib/worktree-runtime-owner'
import type { GlobalSettings } from '../../../../shared/types'
import type { importExternalPathsToRuntime as ImportExternalPathsToRuntime } from '@/runtime/runtime-file-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'
// Why: isTerminalDropWindowsPathLike is exported from terminal-drop-shell, NOT
// terminal-drop-worktree-path — importing from the latter fails typecheck.
import { isTerminalDropWindowsPathLike } from './terminal-drop-shell'
import {
  joinRuntimePasteImagesDir,
  resolveTerminalDropWorktreePath
} from './terminal-drop-worktree-path'

type ToastId = string | number
type ToastApi = {
  loading: (message: string, data?: ExternalToast) => ToastId
  dismiss: (id?: ToastId) => void
  error: (message: string, data?: ExternalToast) => ToastId
}

export type MakeTerminalClipboardImageSaverDeps = {
  worktreeId: string
  fallbackCwd: string | undefined
  connectionId: string | null
  getOwnerState: () => WorktreeRuntimeOwnerState & { settings: GlobalSettings }
  saveLocalImageTempFile: (args?: { connectionId?: string | null }) => Promise<string | null>
  importExternalPathsToRuntime: typeof ImportExternalPathsToRuntime
  deleteLocalImageTempFile: (filePath: string) => Promise<void>
  toast: ToastApi
}

export type TerminalClipboardImageSaver = (args?: {
  connectionId?: string | null
}) => Promise<string | null>

export function makeTerminalClipboardImageSaver(
  deps: MakeTerminalClipboardImageSaverDeps
): TerminalClipboardImageSaver {
  return async (args) => {
    const state = deps.getOwnerState()
    const environmentId = getRuntimeEnvironmentIdForWorktree(state, deps.worktreeId)
    // Non-environment worktrees (local / SSH) keep their existing behavior.
    if (!environmentId) {
      return deps.saveLocalImageTempFile({ connectionId: args?.connectionId ?? deps.connectionId })
    }
    // Egress is explicit (Ctrl/Cmd+V) but still gated so it can be turned off.
    if (!state.settings.terminalRemoteClipboardImagePaste) {
      return null
    }
    const localPath = await deps.saveLocalImageTempFile()
    if (!localPath) {
      return null
    }
    // A local temp file now exists; the finally below cleans it on EVERY exit
    // (including the "worktree not ready" throw before upload starts).
    let pending: string | number | undefined
    try {
      const worktreePath = resolveTerminalDropWorktreePath(deps.worktreeId, deps.fallbackCwd)
      if (!worktreePath) {
        throw new Error(
          translate(
            'auto.components.terminal.pane.clipboardImagePaste.worktreeNotReady',
            'Worktree not ready — try again in a moment.'
          )
        )
      }
      pending = deps.toast.loading(
        translate(
          'auto.components.terminal.pane.clipboardImagePaste.uploading',
          'Uploading pasted image to runtime…'
        )
      )
      const { results } = await deps.importExternalPathsToRuntime(
        {
          settings: getSettingsForWorktreeRuntimeOwner(state, deps.worktreeId),
          worktreeId: deps.worktreeId,
          worktreePath
        },
        [localPath],
        joinRuntimePasteImagesDir(worktreePath)
      )
      const imported = results.find((result) => result.status === 'imported')
      if (!imported || imported.status !== 'imported') {
        const failed = results.find((result) => result.status === 'failed')
        throw new Error(
          failed && failed.status === 'failed'
            ? failed.reason
            : 'Image upload to runtime did not complete'
        )
      }
      // files.* upload is worktree-relative; inject the absolute remote path the
      // agent can read, matching the worktree's path separator.
      return isTerminalDropWindowsPathLike(worktreePath)
        ? imported.destPath.replace(/\//g, '\\')
        : imported.destPath
    } catch (error) {
      // Old remote runtimes predate files.* — surface an actionable message
      // instead of a raw RPC error.
      if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
        const friendly = translate(
          'auto.components.terminal.pane.clipboardImagePaste.runtimeTooOld',
          'Update the remote runtime to paste images into it.'
        )
        deps.toast.error(friendly)
        throw new Error(friendly)
      }
      deps.toast.error(extractIpcErrorMessage(error, 'Failed to upload pasted image.'))
      throw error
    } finally {
      if (pending !== undefined) {
        deps.toast.dismiss(pending)
      }
      // Best-effort: the local temp lives in the OS temp dir; drop it on every exit.
      void deps.deleteLocalImageTempFile(localPath).catch(() => {})
    }
  }
}
