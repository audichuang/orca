// Fork-only: items the fork plugs into upstream's source control file context menu.
import type React from 'react'
import { History, PanelRight } from 'lucide-react'
import { ContextMenuItem, ContextMenuShortcut } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import {
  getSourceControlSplitOpenShortcutLabel,
  SOURCE_CONTROL_OPEN_TO_SIDE_EVENT,
  type SourceControlRowOpenEvent
} from './split-open'

export type SourceControlEntryContextMenuSlots = {
  /** After View: Open to the Side, Show File History. */
  viewItems?: React.ReactNode
  /** After Copy Relative Path: ClipCode Copy Full Source. */
  copyItems?: React.ReactNode
}

/** Disabled without `onOpen`, e.g. on a folder row of a commit's file list. */
export function OpenToSideMenuItem({
  onOpen
}: {
  onOpen?: (event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  return (
    <ContextMenuItem
      onSelect={onOpen ? () => onOpen(SOURCE_CONTROL_OPEN_TO_SIDE_EVENT) : undefined}
      disabled={!onOpen}
    >
      <PanelRight className="size-3.5" />
      {translate(
        'auto.components.right.sidebar.source.control.listing.entry.context.menu.ce8235a6a4',
        'Open to the Side'
      )}
      {/* Why: Alt-click is the pointer shortcut; Ctrl/Cmd/Shift-click only multi-selects. */}
      <ContextMenuShortcut>{getSourceControlSplitOpenShortcutLabel()}</ContextMenuShortcut>
    </ContextMenuItem>
  )
}

export function ShowFileHistoryMenuItem({ onSelect }: { onSelect: () => void }): React.JSX.Element {
  return (
    <ContextMenuItem onSelect={onSelect}>
      <History className="size-3.5" />
      {translate(
        'auto.components.right.sidebar.source.control.listing.entry.context.menu.showFileHistory',
        'Show File History'
      )}
    </ContextMenuItem>
  )
}
