import type React from 'react'
import { ClipboardCopy, Copy, Globe, Hash, Sparkles } from 'lucide-react'
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
  onAction,
  selectedCount = 1
}: {
  item: GitHistoryItem
  onAction: (action: GitHistoryCommitAction, item: GitHistoryItem) => void
  /** Commits a multi-commit action covers; >1 only when the right-clicked row is in the selection. */
  selectedCount?: number
}): React.JSX.Element {
  const managedBrowserCreationEnabled = useAppStore(
    (state) =>
      getClientCreationActionPolicy(state, state.activeWorktreeId)['managed-browser'].state ===
      'enabled'
  )
  return (
    <ContextMenuContent className="w-56">
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
        {translate(
          'auto.components.right.sidebar.GitHistoryCommitContextMenu.8c2d5fab13',
          'Copy commit hash'
        )}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onAction('copy-message', item)}>
        <Copy className="size-3.5" />
        {translate(
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
