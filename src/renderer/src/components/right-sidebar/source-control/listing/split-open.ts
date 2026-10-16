import { getShortcutPlatform } from '@/lib/shortcut-platform'

export type SourceControlRowOpenEvent = {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  openAsPermanent?: boolean
}

type SourceControlOpenModifierKeys = Pick<
  SourceControlRowOpenEvent,
  'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'
>

// Why: Ctrl/Cmd and Shift build the multi-selection (bulk actions); only Alt/Option opens a split.
export function isSourceControlSplitOpenModifier(event: SourceControlRowOpenEvent): boolean {
  return event.altKey
}

export function shouldOpenSourceControlRowAsPreview(
  event: SourceControlRowOpenEvent | undefined,
  targetGroupId: string | undefined
): boolean {
  return !targetGroupId && event?.openAsPermanent !== true
}

export function toSourceControlRowOpenEvent(
  event: SourceControlOpenModifierKeys
): SourceControlRowOpenEvent {
  return {
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  }
}

export function toPermanentSourceControlRowOpenEvent(
  event: SourceControlOpenModifierKeys
): SourceControlRowOpenEvent {
  return { ...toSourceControlRowOpenEvent(event), openAsPermanent: true }
}

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
