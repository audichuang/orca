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
  listGitGraphRepoChoicesFromState,
  resolveGitGraphDefaultRepoWorktreeId
} from '../../../git-graph-tab/git-graph-tab-model'
import { useSourceControlWorktreeScope } from '../folder/worktree-scope'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'

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
        aria-label={openGitGraphLabel()}
        onClick={() => openGitGraphTab(workspaceId, { repoWorktreeId })}
      >
        <GitGraph />
        {/* Why: in a narrow sidebar the label would squeeze out the folder name or Create PR. */}
        <span className="@max-[300px]/sc-toolbar:hidden">
          {translate('auto.components.right.sidebar.GitGraphFullView.openShort', 'Git Graph')}
        </span>
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

/** True when Git Graph can open for the workspace; recomputed only when repos, worktrees or folders change. */
function useWorkspaceHasGitGraphRepo(workspaceId: string): boolean {
  const { repos, worktreesByRepo, folderWorkspaces } = useAppStore(
    useShallow((s) => ({
      repos: s.repos,
      worktreesByRepo: selectWorktreesByRepo(s),
      folderWorkspaces: selectFolderWorkspaces(s)
    }))
  )
  return useMemo(() => {
    const choices = listGitGraphRepoChoicesFromState(
      { repos, worktreesByRepo, folderWorkspaces },
      workspaceId
    )
    // Why mirror resolveGitGraphDefaultRepoWorktreeId: a non-git repo workspace still lists same-host siblings.
    return parseWorkspaceKey(workspaceId)?.type === 'folder'
      ? choices.length > 0
      : choices.some((choice) => choice.worktree.id === workspaceId)
  }, [repos, worktreesByRepo, folderWorkspaces, workspaceId])
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
