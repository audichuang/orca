// Fork-only: commit row wrapper for Cmd/Ctrl/Shift-click selection (multi-commit Copy Full Source).
import React from 'react'
import { cn } from '@/lib/utils'

type GitHistorySelectableRowProps = React.HTMLAttributes<HTMLDivElement> & {
  selected: boolean
  /** Returns true when the click was a selection gesture; the row then must not also expand. */
  onSelectionClick: (event: React.MouseEvent) => boolean
}

// Why forwardRef and prop spread: it is the ContextMenuTrigger asChild target.
export const GitHistorySelectableRow = React.forwardRef<
  HTMLDivElement,
  GitHistorySelectableRowProps
>(function GitHistorySelectableRow(
  { selected, onSelectionClick, className, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={cn(selected && 'bg-accent', className)}
      onClickCapture={(event) => {
        if (onSelectionClick(event)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {children}
    </div>
  )
})
