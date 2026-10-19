// Fork-only: opens the Git Graph editor tab from the Commits toolbar.
import React from 'react'
import { Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'

export function GitGraphTabLauncher({
  workspaceId,
  repoWorktreeId
}: {
  /** Workspace whose editor hosts the tab (the folder in a folder workspace). */
  workspaceId: string
  repoWorktreeId: string
}): React.JSX.Element {
  const openGitGraphTab = useAppStore((s) => s.openGitGraphTab)
  const shortcut = useShortcutKeyDetails('sourceControl.openGitGraph')
  const label = translate('auto.components.right.sidebar.GitGraphFullView.open', 'Open Git Graph')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={() => openGitGraphTab(workspaceId, { repoWorktreeId })}
        >
          <Maximize2 className="size-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut.keys.length > 0 ? (
            <ShortcutKeyCombo
              keys={shortcut.keys}
              doubleTap={shortcut.doubleTap}
              className="gap-0.5"
              keyCapClassName="min-w-0 border-background/20 bg-background/10 px-1 py-0 text-2xs text-background shadow-none"
              separatorClassName="text-2xs text-background/70"
            />
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
