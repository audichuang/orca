// Moved from editor-save-queue.ts when the fork's filePath pushed it past max-lines; port upstream edits to this dispatch here.
import { ORCA_EDITOR_FILE_SAVED_EVENT, type EditorFileSavedDetail } from './editor-autosave'

export function dispatchEditorFileSaved(detail: Required<EditorFileSavedDetail>): void {
  window.dispatchEvent(
    new CustomEvent<EditorFileSavedDetail>(ORCA_EDITOR_FILE_SAVED_EVENT, { detail })
  )
}
