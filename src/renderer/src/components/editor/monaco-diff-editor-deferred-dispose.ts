// Fork-only: keeps a @monaco-editor/react diff editor alive across a StrictMode effect reconnect.
import type { editor } from 'monaco-editor'

// Why: on a dev StrictMode Suspense reveal, @monaco-editor/react disposes the editor in an effect
// cleanup and re-runs setModel on it in the same flush; deferring lets the reconnect cancel it.
export function deferDiffEditorDispose(diffEditor: editor.IStandaloneDiffEditor): () => void {
  const realDispose = diffEditor.dispose.bind(diffEditor)
  let pending = false
  diffEditor.dispose = () => {
    if (pending) {
      return
    }
    pending = true
    queueMicrotask(() => {
      if (pending) {
        pending = false
        realDispose()
      }
    })
  }
  return () => {
    pending = false
  }
}
