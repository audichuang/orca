// Fork-only: one row of the full-width Git Graph (graph | refs + subject | author | date | hash).
import React from 'react'
import { Cloud, GitBranch, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { initialsFor } from '@/components/github/github-user-avatar'
import {
  GIT_HISTORY_LANE_COLORS,
  type GitHistoryItemRef
} from '../../../../../../shared/git-history'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import { dedupeRemoteTrackingRefs } from '../../../../../../shared/git-history-ref-display'
import { graphColor } from './git-history-graph-svg'
import { GIT_GRAPH_JUMP_ATTRIBUTE, GitGraphLaneSvg } from './git-graph-lane-svg'
import type { GitGraphLaneRow } from './git-graph-lane-layout'
import { formatGitHistoryTimestamp } from './git-history-format'

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
        'flex size-5 shrink-0 items-center justify-center rounded-full text-3xs font-semibold text-background',
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

const compactThisYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})
const compactOlderFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' })

/** Row date: time only matters this year; the full timestamp lives in the tooltip. */
export function formatGitGraphCompactDate(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  const date = new Date(timestamp)
  return date.getFullYear() === new Date().getFullYear()
    ? compactThisYearFormatter.format(date)
    : compactOlderFormatter.format(date)
}

export function formatGitGraphShortDate(timestamp: number | undefined): string {
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return ''
  }
  return shortDateFormatter.format(new Date(timestamp))
}

export type GitGraphColumns = { refs: boolean; author: boolean; date: boolean; hash: boolean }

const ALL_GIT_GRAPH_COLUMNS: GitGraphColumns = { refs: true, author: true, date: true, hash: true }

// Why JS, not container queries: a later stylesheet re-declaring `.flex` (React Grab in dev) beat
// `@max-*:hidden` on flex cells only, so rows kept a column the header had dropped and wrapped.
// Author goes first, then the hash, then the date, so the message always keeps its room.
export function gitGraphColumnsForWidth(listWidth: number | null): GitGraphColumns {
  if (!listWidth) {
    return ALL_GIT_GRAPH_COLUMNS
  }
  return {
    refs: listWidth >= 384,
    author: listWidth >= 672,
    hash: listWidth >= 576,
    date: listWidth >= 448
  }
}

/** The one grid template header and rows share, so their cells always line up. */
export function gitGraphGridTemplate(columns: GitGraphColumns): string {
  return [
    'auto',
    'minmax(0,1fr)',
    columns.author && 'minmax(0,9rem)',
    columns.date && '7rem',
    columns.hash && '4.5rem'
  ]
    .filter(Boolean)
    .join(' ')
}

export function GitGraphFullRow({
  viewModel,
  lanes,
  graphWidth,
  columns,
  selected,
  isTabStop = false,
  headRefId,
  dimmed = false,
  contextMenu,
  onSelect,
  onJump
}: {
  viewModel: GitHistoryItemViewModel
  /** This row's slice of the folded, HEAD-pinned lane layout. */
  lanes: GitGraphLaneRow
  /** Widest graph in the list, so every subject starts in the same column. */
  graphWidth: number
  /** Shared with the header (gitGraphColumnsForWidth). */
  columns: GitGraphColumns
  selected: boolean
  /** The list's single roving tab stop; arrow keys move it. */
  isTabStop?: boolean
  /** The checked-out branch, whose badge is filled. */
  headRefId?: string
  /** Not on the checked-out branch: muted, like IntelliJ's "Highlight current branch". */
  dimmed?: boolean
  /** Right-click menu content (the sidebar's commit menu); boundary rows never get one. */
  contextMenu?: React.ReactNode
  /** Gets the click so Cmd/Ctrl- and Shift-click can extend the selection. */
  onSelect: (event: React.MouseEvent) => void
  /** A click on a folded edge's arrow jumps to the commit at its other end. */
  onJump?: (commitId: string) => void
}): React.JSX.Element {
  const item = viewModel.historyItem
  const isBoundaryNode =
    viewModel.kind === 'incoming-changes' || viewModel.kind === 'outgoing-changes'
  const refs = dedupeRemoteTrackingRefs(item.references ?? [])
  // Why one badge plus "+N": several refs squeezed side by side truncate to unreadable fragments.
  const primaryRef = refs.find((ref) => ref.id === headRefId) ?? refs[0]
  const extraRefs = refs.filter((ref) => ref !== primaryRef)
  const cells = (
    <>
      <div data-col="graph" className="flex h-6 items-center" style={{ width: graphWidth }}>
        <GitGraphLaneSvg viewModel={viewModel} lanes={lanes} />
      </div>
      <div data-col="message" className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {columns.refs && primaryRef && (
          // Why capped, and gone on a tiny list: refs must not squeeze the message to nothing;
          // the details pane lists them all.
          <div className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-1 overflow-hidden">
            <span className="flex min-w-16 shrink">
              <GitGraphRefBadge itemRef={primaryRef} isHead={primaryRef.id === headRefId} />
            </span>
            {extraRefs.length > 0 && (
              <span
                className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-3xs leading-none text-muted-foreground"
                title={extraRefs.map((ref) => ref.name).join('\n')}
              >
                +{extraRefs.length}
              </span>
            )}
          </div>
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            // Why not when selected: the selection must read at full strength, whatever the branch.
            dimmed && !selected ? 'text-muted-foreground' : 'text-foreground'
          )}
          title={item.subject}
        >
          {item.subject}
        </span>
      </div>
      {columns.author && (
        <span data-col="author" className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          {item.author && <GitGraphAuthorAvatar name={item.author} email={item.authorEmail} />}
          <span className="truncate" title={item.authorEmail}>
            {item.author}
          </span>
        </span>
      )}
      {columns.date && (
        <span
          data-col="date"
          className="truncate text-muted-foreground tabular-nums"
          title={[
            formatGitHistoryTimestamp(item.timestamp),
            formatGitGraphRelativeDate(item.timestamp)
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          {formatGitGraphCompactDate(item.timestamp)}
        </span>
      )}
      {columns.hash && (
        <span data-col="hash" className="truncate font-mono text-muted-foreground">
          {/* Why: boundary markers carry a placeholder id (0000000), not a commit hash. */}
          {isBoundaryNode ? null : item.displayId}
        </span>
      )}
    </>
  )
  const rowClassName = 'grid h-6 w-full min-w-0 items-center gap-x-3 px-3 text-left text-xs'
  const gridStyle = { gridTemplateColumns: gitGraphGridTemplate(columns) }
  if (isBoundaryNode) {
    return (
      <div
        className={cn(rowClassName, 'text-muted-foreground')}
        style={gridStyle}
        data-testid="git-graph-full-row"
      >
        {cells}
      </div>
    )
  }
  const button = (
    <button
      type="button"
      className={cn(
        rowClassName,
        'cursor-pointer transition-colors',
        // Why: the selected look (main.css) must not be washed out by the plain hover tint.
        !selected && 'hover:bg-accent/40 focus-visible:bg-accent/40'
      )}
      style={gridStyle}
      aria-pressed={selected}
      tabIndex={isTabStop ? 0 : -1}
      data-git-graph-row=""
      data-commit-id={item.id}
      data-dimmed={dimmed ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-testid="git-graph-full-row"
      onClick={(event) => {
        // Why not a nested button: the row is already one; the arrow is a hit area inside it.
        const jumpTarget =
          event.target instanceof Element
            ? event.target
                .closest(`[${GIT_GRAPH_JUMP_ATTRIBUTE}]`)
                ?.getAttribute(GIT_GRAPH_JUMP_ATTRIBUTE)
            : undefined
        if (jumpTarget && onJump) {
          onJump(jumpTarget)
          return
        }
        onSelect(event)
      }}
    >
      {cells}
    </button>
  )
  if (!contextMenu) {
    return button
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
      {contextMenu}
    </ContextMenu>
  )
}
