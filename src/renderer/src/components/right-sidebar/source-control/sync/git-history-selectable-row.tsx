// Fork-only: commit row wrapper for Cmd/Ctrl/Shift-click selection (multi-commit Copy Full Source).
import React from 'react'
import { cn } from '@/lib/utils'
import type { GitHistoryItem } from '../../../../../../shared/git/history/git-history-types'
import type { GitHistoryCommitSelection } from './use-git-history-commit-selection'

type GitHistorySelectableRowProps = React.HTMLAttributes<HTMLDivElement> & {
  selection: Pick<GitHistoryCommitSelection, 'isSelected' | 'handleRowClick'>
  /** The row's commit, or null for a row that cannot be selected (the base-ref boundary). */
  item: GitHistoryItem | null
}

// Why forwardRef and prop spread: it is the ContextMenuTrigger asChild target.
export const GitHistorySelectableRow = React.forwardRef<
  HTMLDivElement,
  GitHistorySelectableRowProps
>(function GitHistorySelectableRow({ selection, item, className, children, ...rest }, ref) {
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(item && selection.isSelected(item.id) && 'bg-accent', className)}
      onClickCapture={(event) => {
        // A selection gesture must not also expand the row.
        if (item && selection.handleRowClick(item, event)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {children}
    </div>
  )
})
