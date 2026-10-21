import { Copy, Eye, EyeOff } from 'lucide-react'
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { ActionButton } from '../listing/action-button'

// Why width, not display: idle takes no track width yet stays tabbable, and pointer-events-none keeps hit-tests off it.
const ROW_ACTIONS_CLASS =
  'col-start-2 row-start-1 flex w-0 items-center gap-0.5 overflow-hidden opacity-0 pointer-events-none group-hover:w-auto group-hover:opacity-100 group-hover:pointer-events-auto focus-within:w-auto focus-within:opacity-100 focus-within:pointer-events-auto [@media(hover:none)]:w-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto'

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
        'group relative mx-1 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center overflow-hidden rounded-md hover:bg-accent has-[[data-repo-row]:focus-visible]:ring-[3px] has-[[data-repo-row]:focus-visible]:ring-ring/50',
        expanded && 'bg-accent text-accent-foreground'
      )}
    >
      {expanded && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
      {/* Why subgrid: the hover actions take the middle track between branch and counts, so the counts never move or hide. */}
      <button
        type="button"
        data-repo-row
        data-repo-row-id={worktreeId}
        aria-expanded={expanded}
        aria-current={expanded ? 'true' : undefined}
        tabIndex={focusable ? 0 : -1}
        onClick={onToggle}
        title={title}
        className="col-span-full row-start-1 grid min-h-7 grid-cols-subgrid items-center rounded-md px-2 py-1 text-left text-xs focus-visible:outline-none"
      >
        {/* Why: the spaces inside the spans keep the accessible name and innerText readable as "name branch count". */}
        <span className="flex min-w-0 items-center gap-1.5">
          <RepoBadgeMark color={color} className="size-2.5 shrink-0 rounded-[2px]" />
          <span data-repo-row-name className="min-w-0 truncate text-foreground">
            {name}
          </span>{' '}
          {branch && (
            <>
              <span className="min-w-0 max-w-[42%] truncate text-muted-foreground">
                {branch}
              </span>{' '}
            </>
          )}
        </span>
        <span className="col-start-3 flex items-center gap-1.5 pl-1 text-2xs tabular-nums text-muted-foreground">
          {/* Why: the eye toggle only shows on hover, so a hidden repo keeps a static marker. */}
          {sidebarHidden && (
            <EyeOff data-sidebar-hidden-marker aria-hidden="true" className="size-3" />
          )}
          <RepoSyncCounts worktreeId={worktreeId} /> {changeCount > 0 && <span>{changeCount}</span>}
        </span>
      </button>
      <div className={ROW_ACTIONS_CLASS}>
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
