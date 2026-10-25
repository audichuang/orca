// Fork-only: one row of the full-width Git Graph (graph | refs + subject | author | date | hash).
import React from 'react'
import { Cloud, GitBranch, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { initialsFor } from './git-graph-author-initials'
import {
  GIT_HISTORY_LANE_COLORS,
  type GitHistoryItemRef
} from '../../../../../../shared/git-history'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import { dedupeRemoteTrackingRefs } from '../../../../../../shared/git-history-ref-display'
import { graphColor } from './git-history-graph-svg'
import { GitGraphLaneConnectors, GitGraphLaneSvg } from './git-graph-lane-svg'
import { GitGraphRowSubject } from './git-graph-row-subject'
import type { GitGraphLaneRow } from './git-graph-lane-layout'
import { formatGitHistoryTimestamp } from './git-history-format'
import { formatGitGraphCompactDate, formatGitGraphRelativeDate } from './git-graph-date-format'
import type { GitGraphListPrefs } from './git-graph-list-prefs'

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
        // Why capped: a long branch name must not push the commit message out of the row.
        isHead ? 'max-w-40 font-semibold' : 'max-w-32 bg-background'
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

export type GitGraphColumns = { refs: boolean; author: boolean; date: boolean; hash: boolean }

/** What a two-line row puts on its muted second line, in place of the columns. */
export type GitGraphSecondLine = Pick<GitGraphColumns, 'author' | 'date' | 'hash'>

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

/** The user's column choices within what the width allows; two-line rows move them to line two. */
export function gitGraphShownColumns(
  byWidth: GitGraphColumns,
  prefs: GitGraphListPrefs
): GitGraphColumns {
  if (prefs.twoLine) {
    return { refs: byWidth.refs, author: false, date: false, hash: false }
  }
  return {
    refs: byWidth.refs,
    author: byWidth.author && prefs.author,
    date: byWidth.date && prefs.date,
    hash: byWidth.hash && prefs.hash
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

function isPlainEnter(event: React.KeyboardEvent): boolean {
  return (
    event.key === 'Enter' &&
    !event.nativeEvent.isComposing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  )
}

// Why 2: centres the 24px lane band, and so the commit dot, on a 28px row's first line.
const LANE_TOP = 2

function RowRefs({
  refs,
  headRefId,
  className
}: {
  refs: GitHistoryItemRef[]
  headRefId?: string
  className?: string
}): React.JSX.Element | null {
  // Why one badge plus "+N": several refs squeezed side by side truncate to unreadable fragments.
  const primaryRef = refs.find((ref) => ref.id === headRefId) ?? refs[0]
  if (!primaryRef) {
    return null
  }
  const extraRefs = refs.filter((ref) => ref !== primaryRef)
  return (
    // Why capped: refs must not squeeze the message to nothing; the details pane lists them all.
    <span
      data-row-refs=""
      className={cn(
        'flex h-7 max-w-[45%] min-w-0 shrink-0 items-center gap-1 overflow-hidden',
        className
      )}
    >
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
    </span>
  )
}

function dateTitle(timestamp: number | undefined): string {
  return [formatGitHistoryTimestamp(timestamp), formatGitGraphRelativeDate(timestamp)]
    .filter(Boolean)
    .join(' · ')
}

export function GitGraphFullRow({
  viewModel,
  lanes,
  graphWidth,
  columns,
  secondLine,
  selected,
  expanded = false,
  striped = false,
  isTabStop = false,
  headRefId,
  dimmed = false,
  contextMenu,
  onSelect,
  onJump,
  onOpen
}: {
  viewModel: GitHistoryItemViewModel
  /** This row's slice of the folded, HEAD-pinned lane layout. */
  lanes: GitGraphLaneRow
  /** Widest graph in the list, so every subject starts in the same column. */
  graphWidth: number
  /** Shared with the header (gitGraphShownColumns). */
  columns: GitGraphColumns
  /** Set in two-line mode: these fields and the refs move under the message. */
  secondLine?: GitGraphSecondLine
  selected: boolean
  /** The cursor row floats its whole message over the rows below when it is cut off. */
  expanded?: boolean
  /** Every other row gets a faint band so the eye keeps its line across a wide list. */
  striped?: boolean
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
  /** Double-click or Enter: open the commit's whole diff. */
  onOpen?: () => void
}): React.JSX.Element {
  const item = viewModel.historyItem
  const isBoundaryNode =
    viewModel.kind === 'incoming-changes' || viewModel.kind === 'outgoing-changes'
  const refs = columns.refs ? dedupeRemoteTrackingRefs(item.references ?? []) : []
  // Why: boundary markers carry a placeholder id (0000000), not a commit hash.
  const hash = isBoundaryNode ? null : item.displayId
  const subject = (
    <GitGraphRowSubject
      text={item.subject}
      expanded={expanded}
      className={cn(
        secondLine ? 'pt-1.5' : 'flex-1 py-1.5',
        // Why /80, not muted: off-branch messages stay readable; selection reads at full strength.
        dimmed && !selected ? 'text-foreground/80' : 'text-foreground'
      )}
    />
  )
  const cells = (
    <>
      <div
        data-col="graph"
        className="relative self-stretch overflow-hidden"
        style={{ width: graphWidth }}
      >
        <GitGraphLaneConnectors lanes={lanes} top={LANE_TOP} />
        <GitGraphLaneSvg
          viewModel={viewModel}
          lanes={lanes}
          className="absolute left-0"
          style={{ top: LANE_TOP }}
          onJump={onJump}
        />
      </div>
      {secondLine ? (
        <div data-col="message" className="relative flex min-w-0 flex-col pb-1.5">
          {subject}
          <span className="mt-0.5 flex h-4 min-w-0 items-center gap-1.5 overflow-hidden text-2xs leading-4 text-muted-foreground">
            {secondLine.author && item.author && (
              <>
                <GitGraphAuthorAvatar
                  name={item.author}
                  email={item.authorEmail}
                  className="size-4"
                />
                <span className="max-w-40 shrink-0 truncate" title={item.authorEmail}>
                  {item.author}
                </span>
              </>
            )}
            {secondLine.date && (
              <span className="shrink-0 tabular-nums" title={dateTitle(item.timestamp)}>
                {formatGitGraphCompactDate(item.timestamp)}
              </span>
            )}
            {secondLine.hash && hash && <span className="shrink-0 font-mono">{hash}</span>}
            {refs.length > 0 && (
              <RowRefs refs={refs} headRefId={headRefId} className="h-4 max-w-full shrink" />
            )}
          </span>
        </div>
      ) : (
        <div data-col="message" className="relative flex min-h-7 min-w-0 items-start gap-1.5">
          {subject}
          {refs.length > 0 && <RowRefs refs={refs} headRefId={headRefId} />}
        </div>
      )}
      {columns.author && (
        <span
          data-col="author"
          className="flex h-7 min-w-0 items-center gap-1.5 text-muted-foreground"
        >
          {item.author && <GitGraphAuthorAvatar name={item.author} email={item.authorEmail} />}
          <span className="truncate" title={item.authorEmail}>
            {item.author}
          </span>
        </span>
      )}
      {columns.date && (
        <span
          data-col="date"
          className="truncate leading-7 text-foreground/80 tabular-nums"
          title={dateTitle(item.timestamp)}
        >
          {formatGitGraphCompactDate(item.timestamp)}
        </span>
      )}
      {columns.hash && (
        <span data-col="hash" className="truncate font-mono leading-7 text-muted-foreground">
          {hash}
        </span>
      )}
    </>
  )
  const rowClassName = cn(
    'grid min-h-7 w-full min-w-0 items-start gap-x-3 px-3 text-left text-xs',
    striped && !selected && 'bg-muted/40'
  )
  const gridStyle = { gridTemplateColumns: gitGraphGridTemplate(columns) }
  const rowData = {
    'data-expanded': expanded ? 'true' : undefined,
    'data-striped': striped ? 'true' : undefined
  }
  if (isBoundaryNode) {
    return (
      <div
        className={cn(rowClassName, 'text-muted-foreground')}
        style={gridStyle}
        data-testid="git-graph-full-row"
        {...rowData}
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
      {...rowData}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen || !isPlainEnter(event)) {
          return
        }
        // Why prevent: a button's Enter also fires a click, which would collapse a multi-selection.
        event.preventDefault()
        onOpen()
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
