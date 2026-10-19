// Fork-only: one row of the full-width Git Graph (graph | refs + subject | author | date | hash).
import React from 'react'
import { Cloud, GitBranch, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { initialsFor } from '@/components/github/github-user-avatar'
import {
  GIT_HISTORY_LANE_COLORS,
  type GitHistoryItemRef
} from '../../../../../../shared/git-history'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import { dedupeRemoteTrackingRefs } from '../../../../../../shared/git-history-ref-display'
import { GitHistoryGraphSvg, graphColor } from './git-history-graph-svg'

function RefIcon({
  category
}: {
  category: GitHistoryItemRef['category']
}): React.JSX.Element | null {
  const className = 'size-2.5 shrink-0'
  switch (category) {
    case 'tags':
      return <Tag aria-hidden="true" className={className} />
    case 'remote branches':
      return <Cloud aria-hidden="true" className={className} />
    case 'branches':
      return <GitBranch aria-hidden="true" className={className} />
    case 'commits':
    case undefined:
      return null
  }
}

// Why not reuse GitHistoryRow's badge: it caps refs at two and truncates names for the narrow sidebar.
export function GitGraphRefBadge({
  itemRef,
  isHead = false
}: {
  itemRef: GitHistoryItemRef
  /** The checked-out branch gets a filled badge, like Fork and IntelliJ. */
  isHead?: boolean
}): React.JSX.Element {
  const color = itemRef.color ? graphColor(itemRef.color) : 'var(--muted-foreground)'
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-3xs leading-none',
        isHead ? 'font-semibold' : 'bg-background'
      )}
      style={
        isHead
          ? { borderColor: color, background: color, color: 'var(--background)' }
          : { borderColor: itemRef.color ? color : 'var(--border)', color }
      }
      title={itemRef.category ? `${itemRef.name} (${itemRef.category})` : itemRef.name}
      data-head-ref={isHead ? 'true' : undefined}
    >
      <RefIcon category={itemRef.category} />
      <span className="truncate">{itemRef.name}</span>
    </span>
  )
}

function authorColor(key: string): string {
  let hash = 0
  for (const ch of key) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0
  }
  const lanes = GIT_HISTORY_LANE_COLORS
  return graphColor(lanes[Math.abs(hash) % lanes.length] ?? 'git-graph-ref')
}

export function GitGraphAuthorAvatar({
  name,
  email,
  className
}: {
  name?: string
  email?: string
  className?: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-background',
        className
      )}
      style={{ background: authorColor(email ?? name ?? '') }}
    >
      {initialsFor(name ?? email ?? '?', name)}
    </span>
  )
}

/** "3 days ago" in the UI language; empty for a missing timestamp. */
export function formatGitGraphRelativeDate(timestamp: number | undefined): string {
  return timestamp == null || !Number.isFinite(timestamp)
    ? ''
    : formatUiRelativeTime(timestamp - Date.now())
}

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short'
})

export function formatGitGraphShortDate(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  return shortDateFormatter.format(new Date(timestamp))
}

// Why container queries: the list narrows with the branch tree and details pane, not just the window;
// Author goes first, then the hash, so the message keeps its room (IntelliJ drops columns the same way).
export const GIT_GRAPH_FULL_ROW_COLUMNS =
  'grid-cols-[auto_minmax(0,1fr)_minmax(0,9rem)_8.5rem_4.5rem] @max-3xl:grid-cols-[auto_minmax(0,1fr)_8.5rem_4.5rem] @max-xl:grid-cols-[auto_minmax(0,1fr)_8.5rem]'
export const GIT_GRAPH_AUTHOR_COLUMN = '@max-3xl:hidden'
export const GIT_GRAPH_HASH_COLUMN = '@max-xl:hidden'

export function GitGraphFullRow({
  viewModel,
  graphWidth,
  selected,
  headRefId,
  dimmed = false,
  onSelect
}: {
  viewModel: GitHistoryItemViewModel
  /** Widest graph in the list, so every subject starts in the same column. */
  graphWidth: number
  selected: boolean
  /** The checked-out branch, whose badge is filled. */
  headRefId?: string
  /** Not on the checked-out branch: muted, like IntelliJ's "Highlight current branch". */
  dimmed?: boolean
  /** Gets the click so Cmd/Ctrl- and Shift-click can extend the selection. */
  onSelect: (event: React.MouseEvent) => void
}): React.JSX.Element {
  const item = viewModel.historyItem
  const isBoundaryNode =
    viewModel.kind === 'incoming-changes' || viewModel.kind === 'outgoing-changes'
  const refs = dedupeRemoteTrackingRefs(item.references ?? [])
  const cells = (
    <>
      <div className="flex h-6 items-center" style={{ width: graphWidth }}>
        <GitHistoryGraphSvg viewModel={viewModel} />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {refs.length > 0 && (
          // Why capped: many refs on one commit must not squeeze the message to nothing; the title keeps full names.
          <div className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-1 overflow-hidden">
            {refs.map((ref) => (
              <GitGraphRefBadge key={ref.id} itemRef={ref} isHead={ref.id === headRefId} />
            ))}
          </div>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            dimmed ? 'text-muted-foreground' : 'text-foreground'
          )}
          title={item.subject}
        >
          {item.subject}
        </span>
      </div>
      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-muted-foreground',
          GIT_GRAPH_AUTHOR_COLUMN
        )}
      >
        {item.author && (
          <GitGraphAuthorAvatar
            name={item.author}
            email={item.authorEmail}
            className="size-5 text-3xs"
          />
        )}
        <span className="truncate" title={item.authorEmail}>
          {item.author}
        </span>
      </span>
      <span
        className="truncate text-muted-foreground tabular-nums"
        title={formatGitGraphRelativeDate(item.timestamp)}
      >
        {formatGitGraphShortDate(item.timestamp)}
      </span>
      <span className={cn('truncate font-mono text-muted-foreground', GIT_GRAPH_HASH_COLUMN)}>
        {item.displayId}
      </span>
    </>
  )
  const rowClassName = cn(
    'grid h-6 w-full min-w-0 items-center gap-x-3 px-3 text-left text-xs',
    GIT_GRAPH_FULL_ROW_COLUMNS
  )
  if (isBoundaryNode) {
    return (
      <div className={cn(rowClassName, 'text-muted-foreground')} data-testid="git-graph-full-row">
        {cells}
      </div>
    )
  }
  return (
    <button
      type="button"
      className={cn(
        rowClassName,
        'cursor-pointer transition-colors',
        // Why: the selected look (main.css) must not be washed out by the plain hover tint.
        !selected && 'hover:bg-accent/40 focus-visible:bg-accent/40'
      )}
      aria-pressed={selected}
      data-git-graph-row=""
      data-commit-id={item.id}
      data-dimmed={dimmed ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-testid="git-graph-full-row"
      onClick={onSelect}
    >
      {cells}
    </button>
  )
}
