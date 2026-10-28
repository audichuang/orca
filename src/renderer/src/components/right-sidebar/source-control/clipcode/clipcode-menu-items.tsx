// Fork-only: ClipCode Copy Full Source items that upstream menus, section headers and the bulk bar each render in one line.
import type React from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenuItem } from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { TreeNode } from '../../file-explorer-types'
import { ActionButton } from '../listing/action-button'
import type { SourceControlDisplaySection } from '../../../../../../shared/source-control-section-order'
import {
  useClipcodeExplorerActions,
  useClipcodeSourceControlActions
} from './clipcode-actions-context'

export function ClipcodeCopyFullSourceMenuItem({
  onSelect,
  iconClassName
}: {
  onSelect: () => void
  iconClassName?: string
}): React.JSX.Element {
  return (
    <ContextMenuItem onSelect={onSelect}>
      <Copy className={iconClassName} />
      {translate(
        'auto.components.right.sidebar.source.control.listing.entry.context.menu.9137d88b9f',
        'Copy Full Source'
      )}
    </ContextMenuItem>
  )
}

/** A changed-file row's item: copies the selection when the row is in it, else the row. */
export function ClipcodeEntryCopyItem({ rowKey }: { rowKey: string }): React.JSX.Element | null {
  const actions = useClipcodeSourceControlActions()
  return actions ? (
    <ClipcodeCopyFullSourceMenuItem
      iconClassName="size-3.5"
      onSelect={() => actions.copyRowFullSource(rowKey)}
    />
  ) : null
}

export function ClipcodeExplorerCopyItem({ node }: { node: TreeNode }): React.JSX.Element | null {
  const actions = useClipcodeExplorerActions()
  return actions ? (
    <ClipcodeCopyFullSourceMenuItem onSelect={() => actions.copyNodeFullSource(node)} />
  ) : null
}

/** Section header action; hidden while filtering or capped, where it would copy a partial set. */
export function ClipcodeSectionCopyButton({
  section,
  filter
}: {
  /** The unfiltered section: the copy covers every file in it. */
  section: Pick<SourceControlDisplaySection, 'area' | 'items'>
  filter: string
}): React.JSX.Element | null {
  const actions = useClipcodeSourceControlActions()
  if (!actions || filter || actions.isStatusTruncated || section.items.length === 0) {
    return null
  }
  return (
    <ActionButton
      icon={Copy}
      title={translate(
        'auto.components.right.sidebar.source.control.listing.uncommitted.sections.1a59d5a05b',
        'Copy Full Source'
      )}
      onClick={(event) => {
        event.stopPropagation()
        actions.copySectionFullSource(section.items, section.area)
      }}
    />
  )
}

export function ClipcodeBulkCopyButton({
  disabled
}: {
  disabled: boolean
}): React.JSX.Element | null {
  const actions = useClipcodeSourceControlActions()
  if (!actions) {
    return null
  }
  const copyLabel = translate(
    'auto.components.right.sidebar.source.control.commit.bulk.action.bar.8a434c829f',
    'Copy Full Source'
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="size-7 shrink-0"
          aria-label={copyLabel}
          onClick={actions.copySelectionFullSource}
          disabled={disabled}
        >
          <Copy className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {copyLabel}
      </TooltipContent>
    </Tooltip>
  )
}
