// Fork-only: opens the full-width Git Graph from the Commits toolbar.
import React, { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { GitGraphFullView, type GitGraphFullViewProps } from './git-graph-full-view'

export function GitGraphFullViewLauncher(props: GitGraphFullViewProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const label = translate('auto.components.right.sidebar.GitGraphFullView.open', 'Open Git Graph')
  // Why close first: diffs open in the editor behind this modal.
  const closeThen =
    <A extends unknown[]>(action: (...args: A) => void) =>
    (...args: A): void => {
      setOpen(false)
      action(...args)
    }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onClick={() => setOpen(true)}
          >
            <Maximize2 className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none flex-col overflow-hidden sm:max-w-none"
          // Why: the view focuses the commit list itself; Radix would land on the first toolbar button.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogTitle className="sr-only">{label}</DialogTitle>
          <DialogDescription className="sr-only">
            {translate(
              'auto.components.right.sidebar.GitGraphFullView.description',
              'Commit graph for the current repository.'
            )}
          </DialogDescription>
          {open && (
            <GitGraphFullView
              {...props}
              onOpenCommit={closeThen(props.onOpenCommit)}
              onOpenCommitFile={closeThen(props.onOpenCommitFile)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
