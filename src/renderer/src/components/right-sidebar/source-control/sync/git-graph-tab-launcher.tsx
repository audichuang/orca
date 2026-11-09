// Fork-only: entry points to the Git Graph editor tab.
import React, { useMemo } from 'react'
import { GitGraph } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import {
  listGitGraphRepoChoicesFromInputs,
  selectGitGraphChoiceInputs
} from '../../../git-graph-tab/git-graph-tab-model'

function openGitGraphLabel(): string {
  return translate('auto.components.right.sidebar.GitGraphFullView.open', 'Open Git Graph')
}

function GitGraphShortcutTooltip({
  children
}: {
  children: React.ReactElement
}): React.JSX.Element {
  const shortcut = useShortcutKeyDetails('sourceControl.openGitGraph')
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        <span className="flex items-center gap-1.5">
          {openGitGraphLabel()}
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

/** Commits section header: opens the graph on that section's repo. */
export function GitGraphTabLauncher({
  workspaceId,
  repoWorktreeId
}: {
  /** Workspace whose editor hosts the tab (the folder in a folder workspace). */
  workspaceId: string
  repoWorktreeId: string
}): React.JSX.Element {
  const openGitGraphTab = useAppStore((s) => s.openGitGraphTab)
  return (
    <GitGraphShortcutTooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="my-auto"
        data-git-graph-launcher="commits"
        aria-label={openGitGraphLabel()}
        onClick={() => openGitGraphTab(workspaceId, { repoWorktreeId })}
      >
        <GitGraph className="size-3" />
      </Button>
    </GitGraphShortcutTooltip>
  )
}

/** True when Git Graph can open for the workspace; recomputed only when repos, worktrees or folders change. */
function useWorkspaceHasGitGraphRepo(workspaceId: string): boolean {
  const inputs = useAppStore(useShallow(selectGitGraphChoiceInputs))
  return useMemo(() => {
    const choices = listGitGraphRepoChoicesFromInputs(inputs, workspaceId)
    // Why mirror resolveGitGraphDefaultRepoWorktreeId: a non-git repo workspace still lists same-host siblings.
    return parseWorkspaceKey(workspaceId)?.type === 'folder'
      ? choices.length > 0
      : choices.some((choice) => choice.worktree.id === workspaceId)
  }, [inputs, workspaceId])
}

/** Tab-strip entry beside the right-sidebar toggle, so the graph opens without the sidebar. */
export function TabStripGitGraphButton({
  workspaceId,
  active
}: {
  workspaceId: string
  /** The group's active tab is already the Git Graph. */
  active: boolean
}): React.JSX.Element | null {
  const openGitGraphTab = useAppStore((s) => s.openGitGraphTab)
  const hasRepo = useWorkspaceHasGitGraphRepo(workspaceId)
  if (!hasRepo) {
    return null
  }
  return (
    <GitGraphShortcutTooltip>
      <button
        type="button"
        aria-label={openGitGraphLabel()}
        aria-pressed={active}
        onClick={() => openGitGraphTab(workspaceId)}
        className="my-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent aria-pressed:bg-accent aria-pressed:text-accent-foreground @max-[260px]/tab-strip:hidden"
      >
        <GitGraph className="size-3.5" />
      </button>
    </GitGraphShortcutTooltip>
  )
}
