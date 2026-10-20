// Fork-only: re-lays the upstream swimlanes for the full Git Graph, folding long edges and pinning HEAD's line left.
import type { GitHistoryGraphColorId, GitHistoryItem } from '../../../../../../shared/git-history'
import {
  getGitHistoryItemColor,
  type GitHistoryItemViewModel
} from '../../../../../../shared/git-history-graph'
import {
  extractTracks,
  foldTracks,
  holdsColumn,
  isVisible,
  type Track
} from './git-graph-lane-tracks'

/** An edge spanning more rows than this is drawn as two short stubs with arrows. */
export const GIT_GRAPH_FOLD_AFTER_ROWS = 20
/** Rows of a folded edge kept visible at each end, so its direction still reads. */
export const GIT_GRAPH_FOLD_STUB_ROWS = 2

export type GitGraphLaneSegment =
  | { kind: 'through'; from: number; to: number; color: GitHistoryGraphColorId }
  | { kind: 'into-node'; from: number; color: GitHistoryGraphColorId }
  | { kind: 'out-of-node'; to: number; color: GitHistoryGraphColorId }
  /** The edge continues `rows` rows below at `target`; no target means past the loaded commits. */
  | {
      kind: 'fold-down'
      at: number
      color: GitHistoryGraphColorId
      target?: GitHistoryItem
      rows?: number
    }
  /** The edge resumes here from `target`, `rows` rows above. */
  | {
      kind: 'fold-up'
      at: number
      color: GitHistoryGraphColorId
      target?: GitHistoryItem
      rows: number
    }

export type GitGraphLaneRow = {
  nodeColumn: number
  nodeColor: GitHistoryGraphColorId
  /** Columns the row's drawing spans, node included. */
  laneCount: number
  segments: GitGraphLaneSegment[]
}

function lowestFree(...used: ReadonlySet<number>[]): number {
  let column = 0
  while (used.some((set) => set.has(column))) {
    column += 1
  }
  return column
}

export function buildGitGraphLaneRows(
  viewModels: readonly GitHistoryItemViewModel[],
  foldAfterRows = GIT_GRAPH_FOLD_AFTER_ROWS,
  stubRows = GIT_GRAPH_FOLD_STUB_ROWS
): GitGraphLaneRow[] {
  const { tracks, rowSegments, chain } = extractTracks(viewModels)
  foldTracks(tracks, foldAfterRows, stubRows)
  const heldAt: Track[][] = Array.from({ length: viewModels.length + 1 }, () => [])
  // Why from the rows too: a parentless HEAD has no outgoing line yet still belongs in column 0.
  let pinnedUntil = viewModels.findLastIndex((vm) => chain.has(vm.historyItem.id)) - 1
  for (const track of tracks) {
    for (let boundary = track.first; boundary <= track.last; boundary += 1) {
      if (holdsColumn(track, boundary)) {
        heldAt[boundary + 1]!.push(track)
      }
    }
    if (track.pinned) {
      pinnedUntil = Math.max(pinnedUntil, track.last)
    }
  }
  // Why column 0 is kept free down to HEAD's last row: the checked-out line never has to shove another lane aside.
  const blocked = (boundary: number): ReadonlySet<number> =>
    boundary <= pinnedUntil ? new Set([0]) : new Set()
  const bySlot = (boundary: number) => (a: Track, b: Track) =>
    (a.slots.get(boundary) ?? 0) - (b.slots.get(boundary) ?? 0)
  const itemAt = (row: number | undefined): GitHistoryItem | undefined =>
    row === undefined ? undefined : viewModels[row]?.historyItem
  // Why: Incoming/Outgoing rows cannot be selected, so a jump follows the line through them to a commit.
  const realRow = (row: number | undefined, toward: 'start' | 'end'): number | undefined => {
    let current = row
    for (let hop = 0; current !== undefined && hop < 4; hop += 1) {
      if (!viewModels[current]!.kind.endsWith('-changes')) {
        return current
      }
      const next = rowSegments[current]!.find((s) =>
        toward === 'end' ? s.kind === 'out-of-node' && s.firstParent : s.kind === 'into-node'
      )
      current = toward === 'end' ? next?.track.endRow : next?.track.startRow
    }
    return undefined
  }
  // Why stable columns: a lane that never moves sideways can never cut through another commit's dot.
  let top = new Map<Track, number>()
  return viewModels.map((vm, row) => {
    for (const track of heldAt[row]!.filter((t) => !top.has(t)).sort(bySlot(row - 1))) {
      top.set(track, lowestFree(new Set(top.values()), blocked(row - 1)))
    }
    const topUsed = new Set(top.values())
    const bottom = new Map<Track, number>()
    const held = heldAt[row + 1]!
    for (const track of held) {
      const column = top.get(track)
      if (column !== undefined) {
        bottom.set(track, column)
      }
    }
    const segments = rowSegments[row]!
    const firstOut = segments.find((s) => s.kind === 'out-of-node' && s.firstParent)
    const intoColumns = segments.flatMap((s) =>
      s.kind === 'into-node' && top.has(s.track) ? [top.get(s.track)!] : []
    )
    const free = (column: number): boolean =>
      column >= 0 &&
      !topUsed.has(column) &&
      ![...bottom.values()].includes(column) &&
      !blocked(row).has(column)
    const onHead = chain.has(vm.historyItem.id)
    let nodeColumn = onHead
      ? 0
      : intoColumns.length > 0
        ? Math.min(...intoColumns)
        : lowestFree(topUsed, new Set(bottom.values()), blocked(row - 1), blocked(row))
    // Why one column per row: lanes drift left into freed space without ever sweeping past a dot.
    if (!onHead && firstOut && free(nodeColumn - 1)) {
      nodeColumn -= 1
    }
    if (firstOut && held.includes(firstOut.track)) {
      bottom.set(firstOut.track, nodeColumn)
    }
    for (const track of held.filter((t) => !bottom.has(t)).sort(bySlot(row))) {
      bottom.set(
        track,
        lowestFree(topUsed, new Set(bottom.values()), new Set([nodeColumn]), blocked(row))
      )
    }
    for (const [track, column] of [...bottom].sort((x, y) => x[1] - y[1])) {
      const moves =
        !track.pinned &&
        isVisible(track, row - 1) &&
        isVisible(track, row) &&
        column - 1 !== nodeColumn &&
        column !== nodeColumn &&
        free(column - 1)
      if (moves) {
        bottom.set(track, column - 1)
      }
    }
    const drawn: GitGraphLaneSegment[] = []
    for (const segment of segments) {
      const { track, color } = segment
      const above = isVisible(track, row - 1) ? top.get(track) : undefined
      const below = isVisible(track, row) ? bottom.get(track) : undefined
      if (segment.kind === 'into-node' && above !== undefined) {
        drawn.push({ kind: 'into-node', from: above, color })
      } else if (segment.kind === 'out-of-node' && below !== undefined) {
        drawn.push({ kind: 'out-of-node', to: below, color })
      } else if (segment.kind === 'through' && above !== undefined && below !== undefined) {
        drawn.push({ kind: 'through', from: above, to: below, color })
      } else if (segment.kind === 'through' && above !== undefined) {
        const end = realRow(track.endRow, 'end')
        drawn.push({
          kind: 'fold-down',
          at: above,
          color,
          target: itemAt(end),
          rows: end === undefined ? undefined : end - row
        })
      } else if (segment.kind === 'through' && below !== undefined) {
        const start = realRow(track.startRow, 'start')
        drawn.push({
          kind: 'fold-up',
          at: below,
          color,
          target: itemAt(start),
          rows: row - (start ?? track.first)
        })
      }
    }
    const laneCount = Math.max(...top.values(), ...bottom.values(), nodeColumn) + 1
    top = bottom
    return { nodeColumn, nodeColor: getGitHistoryItemColor(vm), laneCount, segments: drawn }
  })
}
