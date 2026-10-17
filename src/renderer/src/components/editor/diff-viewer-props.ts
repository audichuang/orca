import type { LargeDiffRenderLimit } from './large-diff-render-limit'

export type DiffViewerProps = {
  modelKey: string
  originalModelKey?: string
  modifiedModelKey?: string
  originalContent: string
  modifiedContent: string
  language: string
  filePath: string
  relativePath: string
  sideBySide: boolean
  editable?: boolean
  // Hosted review dialogs may have no workspace for local comments.
  worktreeId?: string
  onAddLineComment?: (args: {
    lineNumber: number
    startLine?: number
    body: string
  }) => Promise<boolean>
  commentableLineNumbers?: readonly number[]
  addLineCommentLabel?: string
  addLineCommentPlaceholder?: string
  onContentChange?: (content: string) => void
  onSave?: (content: string) => void
  largeDiffRenderLimit?: LargeDiffRenderLimit
  // Render-limited IPC bodies are blank placeholders, never saveable drafts.
  largeDiffSaveContentAvailable?: boolean
  // Why: Changes mode shares the tab buffer with Source/Rich modes, so its kept modified model can be older than `modifiedContent` on remount.
  syncKeptModifiedModelOnMount?: boolean
}
