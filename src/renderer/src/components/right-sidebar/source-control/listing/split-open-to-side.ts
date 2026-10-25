import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { SourceControlRowOpenEvent } from './split-open'

/** The Alt-click event, for menu items that open the row in a split to the right. */
export const SOURCE_CONTROL_OPEN_TO_SIDE_EVENT: SourceControlRowOpenEvent = {
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  openAsPermanent: true
}

export function getSourceControlSplitOpenShortcutLabel(): string {
  return getShortcutPlatform() === 'darwin' ? '⌥Click' : 'Alt+Click'
}
