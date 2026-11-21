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
// `isMac` is upstream's parameter; the fork's rule needs no platform check.
export function isSourceControlSplitOpenModifier(
  event: SourceControlRowOpenEvent,
  _isMac?: boolean
): boolean {
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
