// Moved from EditorFileTab.tsx when the fork's Git Graph tab icon pushed it past max-lines; port upstream edits to this chain here.
import { Eye, GitCompareArrows, ListChecks, ShieldAlert, type LucideIcon } from 'lucide-react'
import type { OpenFile } from '../../store/slices/editor'
import { forkEditorTabIcon } from '@/components/git-graph-tab/git-graph-editor-surfaces'

export function editorFileTabHoverIcon(mode: OpenFile['mode'], fileIcon: LucideIcon): LucideIcon {
  return mode === 'conflict-review'
    ? ShieldAlert
    : mode === 'check-details'
      ? ListChecks
      : mode === 'diff'
        ? GitCompareArrows
        : mode === 'markdown-preview'
          ? Eye
          : (forkEditorTabIcon(mode) ?? fileIcon)
}
