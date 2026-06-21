import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { importExternalPathsToRuntime } from '@/runtime/runtime-file-client'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { GlobalSettings } from '../../../../shared/types'
import type { WorktreeRuntimeOwnerState } from '@/lib/worktree-runtime-owner'
import {
  makeTerminalClipboardImageSaver,
  type TerminalClipboardImageSaver
} from './terminal-clipboard-image-runtime-upload'

// Builds a saver that uploads the clipboard image to the runtime when the
// worktree is backed by a runtime environment, falling back to local temp-file.
export function buildClipboardImageSaver(
  worktreeId: string,
  fallbackCwd: string | undefined,
  connectionId: string | null
): TerminalClipboardImageSaver {
  // Why: the web preload's saveClipboardImageAsTempFile already uploads to the
  // runtime and returns a remote path directly; stageExternalPathsForRuntimeUpload
  // is a stub returning { sources: [] }, so the desktop upload factory would always
  // fail with "Image upload to runtime did not complete" in the web client.
  if (isWebClientLocation()) {
    return window.api.ui.saveClipboardImageAsTempFile
  }
  return makeTerminalClipboardImageSaver({
    worktreeId,
    fallbackCwd,
    connectionId,
    // Why: AppState.settings is GlobalSettings | null but the saver only uses it
    // when a runtime environment is active (settings must be loaded by then).
    getOwnerState: () =>
      useAppStore.getState() as WorktreeRuntimeOwnerState & { settings: GlobalSettings },
    saveLocalImageTempFile: window.api.ui.saveClipboardImageAsTempFile,
    importExternalPathsToRuntime,
    deleteLocalImageTempFile: window.api.ui.deleteClipboardImageTempFile,
    toast
  })
}
