import { ChevronDown, Copy, Eye, EyeOff } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ActionButton } from '../listing/action-button'

/** One accordion header in a folder workspace's repo list. */
export function FolderRepoRow({
  worktreeId,
  label,
  changeCount,
  focusable,
  expanded,
  onToggle,
  onCopy,
  sidebarHidden,
  onToggleSidebarHidden
}: {
  worktreeId: string
  label: string
  changeCount: number
  focusable: boolean
  expanded: boolean
  onToggle: () => void
  onCopy: () => void
  /** Undefined when the repo cannot be hidden, e.g. it contains the folder itself. */
  sidebarHidden?: boolean
  onToggleSidebarHidden?: () => void
}) {
  return (
    <div
      className={cn(
        'relative mx-1 flex items-center gap-1 rounded-md pr-1 hover:bg-accent/50 has-[[data-repo-row]:focus-visible]:ring-[3px] has-[[data-repo-row]:focus-visible]:ring-ring/50',
        expanded && 'bg-accent text-accent-foreground hover:bg-accent'
      )}
    >
      {expanded && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      <button
        type="button"
        data-repo-row
        aria-expanded={expanded}
        aria-current={expanded ? 'true' : undefined}
        tabIndex={focusable ? 0 : -1}
        onClick={onToggle}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs focus-visible:outline-none"
      >
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            !expanded && '-rotate-90'
          )}
        />
        <span className="min-w-0 truncate font-medium" title={label}>
          {label}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {changeCount}
        </span>
      </button>
      <RepoSyncCounts worktreeId={worktreeId} />
      {sidebarHidden !== undefined && onToggleSidebarHidden && (
        <ActionButton
          icon={sidebarHidden ? EyeOff : Eye}
          title={
            sidebarHidden
              ? translate(
                  'auto.components.right.sidebar.source.control.folder.folder.repo.row.showInSidebar',
                  'Hidden from the sidebar. Show it as a sidebar project'
                )
              : translate(
                  'auto.components.right.sidebar.source.control.folder.folder.repo.row.hideFromSidebar',
                  'Shown in the sidebar. Keep it in this folder only'
                )
          }
          onClick={onToggleSidebarHidden}
        />
      )}
      <ActionButton
        icon={Copy}
        title={translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.d98e7b731c',
          'Copy all changes'
        )}
        onClick={onCopy}
      />
    </div>
  )
}

function RepoSyncCounts({ worktreeId }: { worktreeId: string }) {
  const status = useAppStore((s) => s.remoteStatusesByWorktree[worktreeId])
  if (!status?.hasUpstream || (status.ahead === 0 && status.behind === 0)) {
    return null
  }
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
      {status.behind > 0 ? `↓${status.behind}` : ''}
      {status.ahead > 0 ? ` ↑${status.ahead}` : ''}
    </span>
  )
}
