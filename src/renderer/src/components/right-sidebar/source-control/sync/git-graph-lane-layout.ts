// Fork-only: re-lays the upstream swimlanes for the full Git Graph, folding long edges and pinning HEAD's line left.
import type { GitHistoryGraphColorId, GitHistoryItem } from '../../../../../../shared/git-history'
import {
  getGitHistoryItemColor,
  getGitHistoryItemLaneIndex,
  getGitHistoryMergeParentLaneIndex,
  type GitHistoryItemViewModel
} from '../../../../../../shared/git-history-graph'

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

type Track = {
  /** Boundary b is the gap below row b; a track occupies a contiguous boundary range. */
  first: number
  last: number
  slots: Map<number, number>
  startRow?: number
  endRow?: number
  pinned: boolean
  hiddenFrom?: number
  hiddenTo?: number
}

type RowSegment =
  | { kind: 'through'; track: Track; color: GitHistoryGraphColorId }
  | { kind: 'into-node'; track: Track; color: GitHistoryGraphColorId; atCircle: boolean }
  | { kind: 'out-of-node'; track: Track; color: GitHistoryGraphColorId; firstParent: boolean }

function headChainIds(viewModels: readonly GitHistoryItemViewModel[]): Set<string> {
  const byId = new Map(viewModels.map((vm) => [vm.historyItem.id, vm.historyItem]))
  const chain = new Set<string>()
  const outgoing = viewModels.find((vm) => vm.kind === 'outgoing-changes')
  let id = outgoing?.historyItem.id ?? viewModels.find((vm) => vm.kind === 'HEAD')?.historyItem.id
  while (id !== undefined && !chain.has(id)) {
    chain.add(id)
    id = byId.get(id)?.parentIds[0]
  }
  return chain
}

function newTrack(first: number, slot: number): Track {
  return { first, last: first, slots: new Map([[first, slot]]), pinned: false }
}

// Why positional: the upstream renderer connects rows by slot index, so slot j below row r is slot j above row r+1.
function extractTracks(viewModels: readonly GitHistoryItemViewModel[]): {
  tracks: Track[]
  rowSegments: RowSegment[][]
} {
  const tracks: Track[] = []
  const rowSegments: RowSegment[][] = []
  const chain = headChainIds(viewModels)
  let above: Track[] = []
  viewModels.forEach((vm, row) => {
    const { historyItem, inputSwimlanes: input, outputSwimlanes: output } = vm
    const circle = getGitHistoryItemLaneIndex(vm)
    const segments: RowSegment[] = []
    const below: Track[] = []
    const place = (track: Track, slot: number): void => {
      below[slot] = track
      track.last = row
      track.slots.set(row, slot)
    }
    const top = input.map((_, slot) => {
      const track = above[slot]
      if (track) {
        return track
      }
      const dangling = newTrack(row - 1, slot)
      tracks.push(dangling)
      return dangling
    })
    let outIndex = 0
    input.forEach((lane, slot) => {
      const track = top[slot]!
      if (lane.id === historyItem.id) {
        track.endRow = row
        segments.push({ kind: 'into-node', track, color: lane.color, atCircle: slot === circle })
        if (slot === circle && historyItem.parentIds.length > 0) {
          outIndex += 1
        }
        return
      }
      if (outIndex < output.length && lane.id === output[outIndex]!.id) {
        place(track, outIndex)
        segments.push({ kind: 'through', track, color: lane.color })
        outIndex += 1
      }
    })
    const startAt = (slot: number, color: GitHistoryGraphColorId, firstParent: boolean): void => {
      const track = newTrack(row, slot)
      track.startRow = row
      track.pinned = firstParent && chain.has(historyItem.id)
      tracks.push(track)
      below[slot] = track
      segments.push({ kind: 'out-of-node', track, color, firstParent })
    }
    if (historyItem.parentIds.length > 0) {
      startAt(circle, getGitHistoryItemColor(vm), true)
    }
    for (const parentId of historyItem.parentIds.slice(1)) {
      const slot = getGitHistoryMergeParentLaneIndex(vm, parentId)
      if (slot !== -1) {
        startAt(slot, output[slot]!.color, false)
      }
    }
    output.forEach((_, slot) => {
      if (!below[slot]) {
        const dangling = newTrack(row, slot)
        tracks.push(dangling)
        below[slot] = dangling
      }
    })
    rowSegments.push(segments)
    above = below
  })
  return { tracks, rowSegments }
}

function foldTracks(tracks: readonly Track[], foldAfterRows: number, stubRows: number): void {
  for (const track of tracks) {
    // Why never pinned: folding HEAD's own line would hide the branch the user is on.
    if (track.pinned) {
      continue
    }
    const from = track.first + stubRows
    if (track.endRow === undefined) {
      if (track.last - track.first + 1 > foldAfterRows && from <= track.last) {
        track.hiddenFrom = from
        track.hiddenTo = track.last
      }
      continue
    }
    const to = track.last - stubRows
    if (track.endRow - (track.startRow ?? track.first) > foldAfterRows && from <= to) {
      track.hiddenFrom = from
      track.hiddenTo = to
    }
  }
}

function isVisible(track: Track, boundary: number): boolean {
  return (
    boundary >= track.first &&
    boundary <= track.last &&
    !(
      track.hiddenFrom !== undefined &&
      boundary >= track.hiddenFrom &&
      boundary <= (track.hiddenTo ?? track.hiddenFrom)
    )
  )
}

// Why reserve a row past each arrow: otherwise the next commit's dot lands on the arrow's column and hides it.
function holdsColumn(track: Track, boundary: number): boolean {
  if (isVisible(track, boundary)) {
    return true
  }
  if (track.hiddenFrom === undefined || boundary < track.first || boundary > track.last) {
    return false
  }
  return (
    boundary <= track.hiddenFrom + 1 ||
    (track.endRow !== undefined && boundary >= (track.hiddenTo ?? track.hiddenFrom) - 1)
  )
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
  const { tracks, rowSegments } = extractTracks(viewModels)
  foldTracks(tracks, foldAfterRows, stubRows)
  const heldAt: Track[][] = Array.from({ length: viewModels.length + 1 }, () => [])
  let pinnedUntil = -2
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
    let nodeColumn = firstOut?.track.pinned
      ? 0
      : intoColumns.length > 0
        ? Math.min(...intoColumns)
        : lowestFree(topUsed, new Set(bottom.values()), blocked(row - 1), blocked(row))
    // Why one column per row: lanes drift left into freed space without ever sweeping past a dot.
    if (!firstOut?.track.pinned && firstOut && free(nodeColumn - 1)) {
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
        drawn.push({
          kind: 'fold-down',
          at: above,
          color,
          target: itemAt(track.endRow),
          rows: track.endRow === undefined ? undefined : track.endRow - row
        })
      } else if (segment.kind === 'through' && below !== undefined) {
        drawn.push({
          kind: 'fold-up',
          at: below,
          color,
          target: itemAt(track.startRow),
          rows: row - (track.startRow ?? track.first)
        })
      }
    }
    const laneCount = Math.max(...top.values(), ...bottom.values(), nodeColumn) + 1
    top = bottom
    return { nodeColumn, nodeColor: getGitHistoryItemColor(vm), laneCount, segments: drawn }
  })
}
