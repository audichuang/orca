// Fork-only: the scrolling repo list of a folder workspace's Source Control, with its group headers.
import type { ReactNode } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { SectionHeader } from '../listing/section-header'
import type { FolderRepoGroupId, FolderRepoListItem } from './folder-repo-groups'

export function FolderRepoList({
  items,
  fill,
  onToggleGroup,
  renderRow
}: {
  items: readonly FolderRepoListItem[]
  /** True when no repo panel sits below, so the list takes the whole height. */
  fill: boolean
  onToggleGroup: (group: FolderRepoGroupId) => void
  renderRow: (index: number) => ReactNode
}) {
  return (
    <div
      data-folder-repo-list
      className={cn(
        'min-h-0 overflow-y-auto pb-1 scrollbar-sleek',
        fill ? 'flex-1' : 'max-h-[40%] shrink-0'
      )}
    >
      {items.map((item) =>
        item.kind === 'group' ? (
          <SectionHeader
            key={`group-${item.group}`}
            label={
              item.group === 'changes'
                ? translate(
                    'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.groupChanges',
                    'Changes'
                  )
                : translate(
                    'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.groupNoChanges',
                    'No changes'
                  )
            }
            count={item.count}
            isCollapsed={!item.expanded}
            onToggle={() => onToggleGroup(item.group)}
          />
        ) : (
          renderRow(item.index)
        )
      )}
    </div>
  )
}
