// Moved from EditorFileTab.tsx to keep it within max-lines; port upstream edits to this chain here.
import {
  Eye,
  GitCompareArrows,
  ListChecks,
  ShieldAlert,
  Smartphone,
  type LucideIcon
} from 'lucide-react'
import type { OpenFile } from '@/store/slices/editor/types/open-file'

/** A mode's fixed icon, or null for the file-type (icon theme) icon. */
export function editorFileTabModeIcon(
  file: Pick<OpenFile, 'mode' | 'language'>
): LucideIcon | null {
  const { mode } = file
  return mode === 'conflict-review'
    ? ShieldAlert
    : mode === 'check-details'
      ? ListChecks
      : mode === 'diff'
        ? GitCompareArrows
        : mode === 'markdown-preview'
          ? Eye
          : // Why: simulator tabs reuse this chrome with a synthetic path an icon theme would map to its file icon.
            file.language === 'simulator'
            ? Smartphone
            : null
}
