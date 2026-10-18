// Fork-only: one row of the full-width Git Graph (graph | subject + every ref | author | date | hash).
import React from 'react'
import { Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GitHistoryItemRef } from '../../../../../../shared/git-history'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import { dedupeRemoteTrackingRefs } from '../../../../../../shared/git-history-ref-display'
import { GitHistoryGraphSvg, graphColor } from './git-history-graph-svg'

// Why not reuse GitHistoryRow's badge: it caps refs at two and truncates names for the narrow sidebar.
export function GitGraphRefBadge({ itemRef }: { itemRef: GitHistoryItemRef }): React.JSX.Element {
  return (
    <span
      className="flex min-w-0 items-center gap-0.5 rounded-full border bg-background px-1.5 py-0.5 text-3xs leading-none"
      style={{
        borderColor: itemRef.color ? graphColor(itemRef.color) : 'var(--border)',
        color: itemRef.color ? graphColor(itemRef.color) : 'var(--muted-foreground)'
      }}
      title={itemRef.category ? `${itemRef.name} (${itemRef.category})` : itemRef.name}
    >
      {itemRef.category === 'tags' && <Tag aria-hidden="true" className="size-2.5 shrink-0" />}
      <span className="truncate">{itemRef.name}</span>
    </span>
  )
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

export const GIT_GRAPH_FULL_ROW_COLUMNS =
  'grid-cols-[auto_minmax(0,1fr)_minmax(0,10rem)_8.5rem_4.5rem]'

export function GitGraphFullRow({
  viewModel,
  graphWidth,
  selected,
  onSelect
}: {
  viewModel: GitHistoryItemViewModel
  /** Widest graph in the list, so every subject starts in the same column. */
  graphWidth: number
  selected: boolean
  onSelect: () => void
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
          <div className="flex max-w-[60%] min-w-0 shrink-0 items-center gap-1 overflow-hidden">
            {refs.map((ref) => (
              <GitGraphRefBadge key={ref.id} itemRef={ref} />
            ))}
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-foreground">{item.subject}</span>
      </div>
      <span className="truncate text-muted-foreground">{item.author}</span>
      <span className="truncate text-muted-foreground tabular-nums">
        {formatGitGraphShortDate(item.timestamp)}
      </span>
      <span className="truncate font-mono text-muted-foreground">{item.displayId}</span>
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
        'cursor-pointer transition-colors hover:bg-accent/40 focus-visible:bg-accent/40',
        selected && 'bg-accent/60 hover:bg-accent/60'
      )}
      aria-pressed={selected}
      data-testid="git-graph-full-row"
      onClick={onSelect}
    >
      {cells}
    </button>
  )
}
