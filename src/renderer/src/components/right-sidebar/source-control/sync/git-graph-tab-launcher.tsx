// Fork-only: entry points to the Git Graph editor tab.
import React from 'react'
import { GitGraph, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'
import { resolveGitGraphDefaultRepoWorktreeId } from '../../../git-graph-tab/git-graph-tab-model'
import { useSourceControlWorktreeScope } from '../folder/worktree-scope'

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
        aria-label={openGitGraphLabel()}
        onClick={() => openGitGraphTab(workspaceId, { repoWorktreeId })}
      >
        <Maximize2 className="size-3" />
      </Button>
    </GitGraphShortcutTooltip>
  )
}

/**
 * Always-visible labelled entry at the top of Source Control, so the graph is reachable without
 * opening a repo first. Hidden when the workspace has no git repo to show.
 */
export function GitGraphOpenButton({
  workspaceId,
  repoWorktreeId
}: {
  workspaceId: string
  /** Repo to open on; defaults to the workspace's own or remembered repo. */
  repoWorktreeId?: string
}): React.JSX.Element | null {
  const openGitGraphTab = useAppStore((s) => s.openGitGraphTab)
  const hasRepo = useAppStore((s) => resolveGitGraphDefaultRepoWorktreeId(s, workspaceId) !== null)
  if (!hasRepo) {
    return null
  }
  return (
    <GitGraphShortcutTooltip>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="shrink-0"
        onClick={() => openGitGraphTab(workspaceId, { repoWorktreeId })}
      >
        <GitGraph />
        {translate('auto.components.right.sidebar.GitGraphFullView.openShort', 'Git Graph')}
      </Button>
    </GitGraphShortcutTooltip>
  )
}

/** Repo workspace header slot; folder workspaces show the button in their own toolbar instead. */
export function RepoWorkspaceGitGraphButton(): React.JSX.Element | null {
  const inFolder = useSourceControlWorktreeScope() !== null
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  return inFolder || !activeWorktreeId ? null : (
    <GitGraphOpenButton workspaceId={activeWorktreeId} />
  )
}
