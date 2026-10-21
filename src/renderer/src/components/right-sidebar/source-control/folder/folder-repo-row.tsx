import { Copy, Eye, EyeOff } from 'lucide-react'
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ActionButton } from '../listing/action-button'
import { SOURCE_CONTROL_ROW_ACTION_OVERLAY_CLASS } from '../listing/row-layout'

/** One selectable repo row in a folder workspace's repo list. */
export function FolderRepoRow({
  worktreeId,
  name,
  branch,
  title,
  color,
  changeCount,
  focusable,
  expanded,
  onToggle,
  onCopy,
  sidebarHidden,
  onToggleSidebarHidden
}: {
  worktreeId: string
  name: string
  branch: string | null
  /** Full name and branch, for the hover tooltip when either is truncated. */
  title: string
  color: string
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
      data-current={expanded ? 'true' : undefined}
      className={cn(
        'group relative mx-1 flex items-center overflow-hidden rounded-md hover:bg-accent has-[[data-repo-row]:focus-visible]:ring-[3px] has-[[data-repo-row]:focus-visible]:ring-ring/50',
        expanded && 'bg-accent text-accent-foreground'
      )}
    >
      {expanded && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      {/* Why: the spaces between spans keep the accessible name and innerText readable as "name branch count". */}
      <button
        type="button"
        data-repo-row
        aria-expanded={expanded}
        aria-current={expanded ? 'true' : undefined}
        tabIndex={focusable ? 0 : -1}
        onClick={onToggle}
        title={title}
        className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs focus-visible:outline-none"
      >
        <RepoBadgeMark color={color} className="size-2.5 rounded-[2px]" />
        <span className="min-w-0 truncate text-foreground">{name}</span>{' '}
        {branch && (
          <>
            <span className="min-w-0 max-w-[42%] truncate text-muted-foreground">
              {branch}
            </span>{' '}
          </>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1 text-2xs tabular-nums text-muted-foreground">
          {/* Why: the eye toggle only shows on hover, so a hidden repo keeps a static marker. */}
          {sidebarHidden && (
            <EyeOff data-sidebar-hidden-marker aria-hidden="true" className="size-3" />
          )}
          <RepoSyncCounts worktreeId={worktreeId} /> {changeCount > 0 && <span>{changeCount}</span>}
        </span>
      </button>
      <div className={SOURCE_CONTROL_ROW_ACTION_OVERLAY_CLASS}>
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
    </div>
  )
}

function RepoSyncCounts({ worktreeId }: { worktreeId: string }) {
  const status = useAppStore((s) => s.remoteStatusesByWorktree[worktreeId])
  if (!status?.hasUpstream || (status.ahead === 0 && status.behind === 0)) {
    return null
  }
  return (
    <span>
      {status.behind > 0 ? `↓${status.behind}` : ''}
      {status.ahead > 0 ? ` ↑${status.ahead}` : ''}
    </span>
  )
}
