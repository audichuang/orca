// Fork-only: turns the upstream swimlanes into tracks (one per drawn edge) and decides which tracks fold.
import type { GitHistoryGraphColorId } from '../../../../../../shared/git-history'
import {
  getGitHistoryItemColor,
  getGitHistoryItemLaneIndex,
  getGitHistoryMergeParentLaneIndex,
  type GitHistoryItemViewModel
} from '../../../../../../shared/git-history-graph'

export type Track = {
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

export type RowSegment =
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
export function extractTracks(viewModels: readonly GitHistoryItemViewModel[]): {
  tracks: Track[]
  rowSegments: RowSegment[][]
  chain: Set<string>
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
  return { tracks, rowSegments, chain }
}

export function foldTracks(
  tracks: readonly Track[],
  foldAfterRows: number,
  stubRows: number
): void {
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

export function isVisible(track: Track, boundary: number): boolean {
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
export function holdsColumn(track: Track, boundary: number): boolean {
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
