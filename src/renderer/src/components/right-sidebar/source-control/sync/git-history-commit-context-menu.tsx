import type React from 'react'
import { ClipboardCopy, Copy, GitGraph, Globe, Hash, Sparkles } from 'lucide-react'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { useAppStore } from '@/store'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'

export type GitHistoryCommitAction =
  | 'open-remote'
  | 'copy-hash'
  | 'copy-message'
  | 'explain'
  | 'copy-full-source'

export function GitHistoryCommitContextMenu({
  item,
  selectedCount = 1,
  onShowInGraph,
  onAction
}: {
  item: GitHistoryItem
  onAction: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
  /** Commits a multi-commit action covers; >1 only when the right-clicked row is in the selection. */
  selectedCount?: number
  /** Fork: opens the commit in the Git Graph tab; the entry shows only when set. */
  onShowInGraph?: (item: GitHistoryItem) => void
}): React.JSX.Element {
  const managedBrowserCreationEnabled = useAppStore(
    (state) =>
      getClientCreationActionPolicy(state, state.activeWorktreeId)['managed-browser'].state ===
      'enabled'
  )
  return (
    <ContextMenuContent className="w-64">
      {managedBrowserCreationEnabled ? (
        <ContextMenuItem onSelect={() => onAction('open-remote', item)}>
          <Globe className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.GitHistoryCommitContextMenu.7b1c4e9a02',
            'Open commit in browser'
          )}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem onSelect={() => onAction('copy-hash', item)}>
        <Hash className="size-3.5" />
        {selectedCount > 1
          ? translate(
              'auto.components.right.sidebar.GitHistoryCommitContextMenu.copyHashMany',
              'Copy commit hashes ({{value0}} commits)',
              { value0: selectedCount }
            )
          : translate(
              'auto.components.right.sidebar.GitHistoryCommitContextMenu.8c2d5fab13',
              'Copy commit hash'
            )}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction('copy-message', item)}>
        <Copy className="size-3.5" />
        {selectedCount > 1
          ? translate(
              'auto.components.right.sidebar.GitHistoryCommitContextMenu.copyMessageMany',
              'Copy commit messages ({{value0}} commits)',
              { value0: selectedCount }
            )
          : translate(
              'auto.components.right.sidebar.GitHistoryCommitContextMenu.9d3e60bc24',
              'Copy commit message'
            )}
      </ContextMenuItem>
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
      {onShowInGraph ? (
        <ContextMenuItem onSelect={() => onShowInGraph(item)}>
          <GitGraph className="size-3.5" />
          {translate(
            'auto.components.right.sidebar.GitHistoryCommitContextMenu.showInGraph',
            'Show in Git Graph'
          )}
        </ContextMenuItem>
      ) : null}
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
