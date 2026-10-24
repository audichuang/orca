// Fork-only: the commit context menu with the fork's entries, wrapped around upstream's menu.
import type React from 'react'
import { ClipboardCopy, Copy, GitGraph, Hash, Sparkles } from 'lucide-react'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import {
  GitHistoryCommitContextMenu,
  type GitHistoryCommitAction
} from './git-history-commit-context-menu'

export type GitHistoryForkCommitAction = GitHistoryCommitAction | 'copy-full-source'

type ForkMenuProps = {
  item: GitHistoryItem
  onAction: (action: GitHistoryForkCommitAction, item: GitHistoryItem) => void
  /** Commits a multi-commit action covers; >1 only when the right-clicked row is in the selection. */
  selectedCount?: number
  /** Opens the commit in the Git Graph tab; the entry shows only when set. */
  onShowInGraph?: (item: GitHistoryItem) => void
}

/**
 * One commit: upstream's menu with the fork's entries in its slot.
 * Several: the fork's own menu, since only the fork selects more than one commit.
 */
export function GitHistoryCommitForkMenu(props: ForkMenuProps): React.JSX.Element {
  const { item, onAction, onShowInGraph } = props
  if ((props.selectedCount ?? 1) > 1) {
    return <MultiCommitMenu {...props} />
  }
  return (
    <GitHistoryCommitContextMenu item={item} onAction={onAction}>
      <CopyFullSourceItem item={item} onAction={onAction} />
      <ShowInGraphItem item={item} onShowInGraph={onShowInGraph} />
    </GitHistoryCommitContextMenu>
  )
}

function CopyFullSourceItem({
  item,
  onAction,
  selectedCount = 1
}: Pick<ForkMenuProps, 'item' | 'onAction' | 'selectedCount'>): React.JSX.Element {
  return (
    <ContextMenuItem onSelect={() => onAction('copy-full-source', item)}>
      <ClipboardCopy className="size-3.5" />
      {selectedCount > 1
        ? translate(
            'auto.components.right.sidebar.GitHistoryCommitContextMenu.copyFullSourceMany',
            'Copy Full Source ({{value0}} commits)',
            { value0: selectedCount }
          )
        : translate(
            'auto.components.right.sidebar.GitHistoryCommitContextMenu.copyFullSource',
            'Copy Full Source'
          )}
    </ContextMenuItem>
  )
}

function ShowInGraphItem({
  item,
  onShowInGraph
}: Pick<ForkMenuProps, 'item' | 'onShowInGraph'>): React.JSX.Element | null {
  if (!onShowInGraph) {
    return null
  }
  return (
    <ContextMenuItem onSelect={() => onShowInGraph(item)}>
      <GitGraph className="size-3.5" />
      {translate(
        'auto.components.right.sidebar.GitHistoryCommitContextMenu.showInGraph',
        'Show in Git Graph'
      )}
    </ContextMenuItem>
  )
}

// Why a copy: upstream's menu hard-codes one-commit labels. Mirrors git-history-commit-context-menu.tsx
// minus Open in browser (one commit only); re-sync its entries on each upstream rebase.
function MultiCommitMenu({
  item,
  onAction,
  selectedCount,
  onShowInGraph
}: ForkMenuProps): React.JSX.Element {
  const count = { value0: selectedCount }
  return (
    <ContextMenuContent className="w-64">
      <ContextMenuItem onSelect={() => onAction('copy-hash', item)}>
        <Hash className="size-3.5" />
        {translate(
          'auto.components.right.sidebar.GitHistoryCommitContextMenu.copyHashMany',
          'Copy commit hashes ({{value0}} commits)',
          count
        )}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction('copy-message', item)}>
        <Copy className="size-3.5" />
        {translate(
          'auto.components.right.sidebar.GitHistoryCommitContextMenu.copyMessageMany',
          'Copy commit messages ({{value0}} commits)',
          count
        )}
      </ContextMenuItem>
      <CopyFullSourceItem item={item} onAction={onAction} selectedCount={selectedCount} />
      <ShowInGraphItem item={item} onShowInGraph={onShowInGraph} />
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => onAction('explain', item)}>
        <Sparkles className="size-3.5" />
        {translate(
          'auto.components.right.sidebar.GitHistoryCommitContextMenu.ae4f71cd35',
          'Explain changes'
        )}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}
