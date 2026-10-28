// Moved from editor-save-queue.ts when the fork's filePath pushed it past max-lines; port upstream edits to this dispatch here.
import type { AppState } from '@/store'
import { ORCA_EDITOR_FILE_SAVED_EVENT, type EditorFileSavedDetail } from './editor-autosave'
import { editorBufferSiblingViewIds } from '@/store/slices/editor/buffers/editor-buffer-views'

export function dispatchEditorFileSaved(
  state: AppState,
  saved: { fileId: string; content: string; filePath: string; savedViewId: string | undefined }
): void {
  window.dispatchEvent(
    new CustomEvent<EditorFileSavedDetail>(ORCA_EDITOR_FILE_SAVED_EVENT, {
      detail: {
        fileId: saved.fileId,
        content: saved.content,
        filePath: saved.filePath,
        recordViewIds: saved.savedViewId
          ? editorBufferSiblingViewIds(state, saved.savedViewId)
          : [saved.fileId]
      }
    })
  )
}
