import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GitHistoryItem, GitHistoryItemRef } from '../../../../../../shared/git-history'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels,
  getGitHistoryItemLaneIndex,
  type GitHistoryItemViewModel
} from '../../../../../../shared/git-history-graph'
import { buildGitGraphLaneRows, type GitGraphLaneRow } from './git-graph-lane-layout'
import { GitGraphLaneSvg } from './git-graph-lane-svg'

function item(id: string, parentIds: string[]): GitHistoryItem {
  return { id, parentIds, subject: `subject ${id}`, message: id, displayId: id }
}

function chain(prefix: string, from: number, to: number, last: string[]): GitHistoryItem[] {
  const items: GitHistoryItem[] = []
  for (let i = from; i <= to; i += 1) {
    items.push(item(`${prefix}${i}`, i < to ? [`${prefix}${i + 1}`] : last))
  }
  return items
}

const HEAD_REF: GitHistoryItemRef = { id: 'refs/heads/feat', name: 'feat', revision: 'h0' }

function withHead(items: GitHistoryItem[]): GitHistoryItemViewModel[] {
  return buildGitHistoryViewModels(
    items,
    buildDefaultGitHistoryColorMap({ currentRef: HEAD_REF }),
    HEAD_REF
  )
}

function folds(rows: GitGraphLaneRow[], kind: 'fold-down' | 'fold-up') {
  return rows.flatMap((row, index) =>
    row.segments.flatMap((segment) =>
      segment.kind === kind ? [{ row: index, target: segment.target?.id, rows: segment.rows }] : []
    )
  )
}

function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A topologically ordered DAG with merges, roots, shared parents and parents past the page.
function randomHistory(seed: number, size: number): GitHistoryItem[] {
  const rnd = mulberry(seed)
  const items: GitHistoryItem[] = []
  for (let i = 0; i < size; i += 1) {
    const parentCount = rnd() < 0.08 ? 0 : rnd() < 0.2 ? 2 : 1
    const parents = new Set<string>()
    for (let p = 0; p < parentCount; p += 1) {
      const offset = 1 + Math.floor(rnd() * 6)
      parents.add(i + offset < size ? `c${i + offset}` : `outside${i}`)
    }
    items.push(item(`c${i}`, [...parents]))
  }
  return items
}

function topColumns(row: GitGraphLaneRow): number[] {
  return row.segments
    .flatMap((s) =>
      s.kind === 'through'
        ? [s.from]
        : s.kind === 'into-node'
          ? [s.from]
          : s.kind === 'fold-down'
            ? [s.at]
            : []
    )
    .sort()
}

function bottomColumns(row: GitGraphLaneRow): number[] {
  return row.segments
    .flatMap((s) =>
      s.kind === 'through'
        ? [s.to]
        : s.kind === 'out-of-node'
          ? [s.to]
          : s.kind === 'fold-up'
            ? [s.at]
            : []
    )
    .sort()
}

// Every lane leaving a row enters the next one, and no lane passes a dot in its row.
function expectSoundLayout(viewModels: GitHistoryItemViewModel[], rows: GitGraphLaneRow[]): void {
  rows.forEach((row, index) => {
    const id = viewModels[index]!.historyItem.id
    if (index + 1 < rows.length) {
      const next = topColumns(rows[index + 1]!)
      // Why a subset next to boundary rows: upstream starts the synthetic incoming lane at that row's top.
      const boundary = viewModels[index + 1]!.kind.endsWith('-changes')
      expect(bottomColumns(row), `continuity below ${id}`).toEqual(
        boundary ? bottomColumns(row).filter((c) => next.includes(c)) : next
      )
    }
    for (const s of row.segments) {
      if (s.kind === 'through') {
        expect(Math.abs(s.from - s.to), `shift at ${id}`).toBeLessThanOrEqual(1)
        expect([s.from, s.to], `lane through dot at ${id}`).not.toContain(row.nodeColumn)
      }
      if (s.kind === 'fold-down' || s.kind === 'fold-up') {
        expect(s.at, `arrow under dot at ${id}`).not.toBe(row.nodeColumn)
      }
    }
  })
}

// With nothing folded, each row has the same edges as the upstream model.
function expectSameEdges(viewModels: GitHistoryItemViewModel[], rows: GitGraphLaneRow[]): void {
  rows.forEach((row, index) => {
    const vm = viewModels[index]!
    const intos = vm.inputSwimlanes.filter((lane) => lane.id === vm.historyItem.id).length
    const merges = vm.historyItem.parentIds
      .slice(1)
      .filter((id) => vm.outputSwimlanes.some((lane) => lane.id === id)).length
    const outs = (vm.historyItem.parentIds.length > 0 ? 1 : 0) + merges
    expect(row.segments.filter((s) => s.kind === 'into-node')).toHaveLength(intos)
    expect(row.segments.filter((s) => s.kind === 'out-of-node')).toHaveLength(outs)
  })
}

describe('buildGitGraphLaneRows', () => {
  it('keeps every lane connected and off other commits, with and without folding', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const viewModels = buildGitHistoryViewModels(randomHistory(seed, 80))
      for (const foldAfter of [Number.POSITIVE_INFINITY, 8]) {
        const rows = buildGitGraphLaneRows(viewModels, foldAfter, 2)
        expectSoundLayout(viewModels, rows)
        if (foldAfter === Number.POSITIVE_INFINITY) {
          expectSameEdges(viewModels, rows)
        }
      }
    }
  })

  it('keeps the incoming and outgoing boundary rows connected, with HEAD pinned left', () => {
    const currentRef: GitHistoryItemRef = {
      id: 'refs/heads/feature',
      name: 'feature',
      revision: 'A'
    }
    const remoteRef: GitHistoryItemRef = {
      id: 'refs/remotes/origin/feature',
      name: 'origin/feature',
      revision: 'R',
      category: 'remote branches'
    }
    const colors = buildDefaultGitHistoryColorMap({ currentRef, remoteRef })
    const histories = [
      [item('A', ['B']), item('R', ['B']), item('B', ['C']), item('C', [])],
      [item('A', ['B']), item('B', ['C']), item('C', [])]
    ]
    for (const history of histories) {
      const viewModels = buildGitHistoryViewModels(
        history,
        colors,
        currentRef,
        remoteRef,
        undefined,
        true,
        true,
        'B'
      )
      expect(viewModels.some((viewModel) => viewModel.kind === 'incoming-changes')).toBe(true)
      const rows = buildGitGraphLaneRows(viewModels)
      expectSoundLayout(viewModels, rows)
      expectSameEdges(viewModels, rows)
      const head = viewModels.findIndex((viewModel) => viewModel.kind === 'HEAD')
      expect(rows[head]!.nodeColumn).toBe(0)
      expect(
        renderToStaticMarkup(<GitGraphLaneSvg viewModel={viewModels[0]!} lanes={rows[0]!} />)
      ).toContain('stroke-dasharray="4 2"')
    }
  })

  it('never routes a lane through a commit dot when folded columns free up together', () => {
    const ref: GitHistoryItemRef = { id: 'refs/heads/m', name: 'm', revision: 'm10' }
    const viewModels = buildGitHistoryViewModels(
      [
        item('b0', ['m26', 'n0']),
        item('c0', ['m5']),
        ...chain('m', 0, 29, ['m30']),
        item('n0', ['m30']),
        item('m30', [])
      ],
      buildDefaultGitHistoryColorMap({ currentRef: ref }),
      ref
    )
    const rows = buildGitGraphLaneRows(viewModels)
    expectSoundLayout(viewModels, rows)
    const chainRows = viewModels.flatMap((vm, index) =>
      /^m(1\d|2\d|30)$/.test(vm.historyItem.id) ? [index] : []
    )
    expect(chainRows.map((index) => rows[index]!.nodeColumn)).toEqual(chainRows.map(() => 0))
  })

  it('puts a parentless HEAD in the leftmost lane', () => {
    const ref: GitHistoryItemRef = { id: 'refs/heads/orphan', name: 'orphan', revision: 'H' }
    const rows = buildGitGraphLaneRows(
      buildGitHistoryViewModels(
        [item('A', ['P']), item('H', []), item('P', [])],
        buildDefaultGitHistoryColorMap({ currentRef: ref }),
        ref
      )
    )
    expect(rows[1]!.nodeColumn).toBe(0)
    expect(rows[0]!.nodeColumn).not.toBe(0)
  })

  it("keeps HEAD in the leftmost lane when its row is another edge's arrow row", () => {
    const rows = buildGitGraphLaneRows(
      withHead([item('b0', ['h30']), item('o0', ['h5']), ...chain('h', 0, 40, [])])
    )
    for (let index = 2; index < rows.length; index += 1) {
      expect(rows[index]!.nodeColumn).toBe(0)
    }
  })

  it('jumps through an Incoming Changes row to the commit behind it', () => {
    const currentRef: GitHistoryItemRef = {
      id: 'refs/heads/feature',
      name: 'feature',
      revision: 'h0'
    }
    const remoteRef: GitHistoryItemRef = {
      id: 'refs/remotes/origin/feature',
      name: 'origin/feature',
      revision: 'R',
      category: 'remote branches'
    }
    const viewModels = buildGitHistoryViewModels(
      [
        { ...item('R', ['B']), references: [remoteRef] },
        { ...item('h0', ['h1']), references: [currentRef] },
        ...chain('h', 1, 29, ['B']),
        item('B', [])
      ],
      buildDefaultGitHistoryColorMap({ currentRef, remoteRef }),
      currentRef,
      remoteRef,
      undefined,
      true,
      true,
      'B'
    )
    const rows = buildGitGraphLaneRows(viewModels)
    expectSoundLayout(viewModels, rows)
    const targets = [...folds(rows, 'fold-down'), ...folds(rows, 'fold-up')].map((f) => f.target)
    expect(targets.length).toBeGreaterThan(0)
    expect(targets).toContain('B')
    const loaded = new Set(['R', 'B', ...chain('h', 0, 29, []).map((c) => c.id)])
    expect(targets.every((id) => id !== undefined && loaded.has(id))).toBe(true)
  })

  it('folds a long edge into stubs that point at each other and frees its lane between them', () => {
    const viewModels = buildGitHistoryViewModels([item('b0', ['m30']), ...chain('m', 0, 40, [])])
    const rows = buildGitGraphLaneRows(viewModels, 20, 2)

    expect(folds(rows, 'fold-down')).toEqual([{ row: 2, target: 'm30', rows: 29 }])
    expect(folds(rows, 'fold-up')).toEqual([{ row: 29, target: 'b0', rows: 29 }])
    expect(Math.max(...rows.slice(6, 27).map((row) => row.laneCount))).toBe(1)
    expect(rows[31]!.segments.filter((s) => s.kind === 'into-node')).toHaveLength(2)
  })

  it('never puts a commit dot on a fold arrow or right next to its tip', () => {
    // Stacked long-lived branches: each block's arrow row is the next block's first commit.
    const blocks = [0, 1, 2, 3, 4, 5].flatMap((j) => [
      item(`b${j}a`, [`b${j}b`]),
      item(`b${j}b`, [`m${30 + j * 5}`])
    ])
    const rows = buildGitGraphLaneRows(
      buildGitHistoryViewModels([...blocks, ...chain('m', 0, 60, [])])
    )
    const arrows = rows.flatMap((row, index) =>
      row.segments.flatMap((s) =>
        s.kind === 'fold-down' || s.kind === 'fold-up' ? [{ index, s }] : []
      )
    )
    expect(arrows.filter(({ s }) => s.kind === 'fold-down')).toHaveLength(6)
    for (const { index, s } of arrows) {
      const neighbour = s.kind === 'fold-down' ? index + 1 : index - 1
      expect(rows[index]!.nodeColumn).not.toBe(s.at)
      expect(rows[neighbour]!.nodeColumn).not.toBe(s.at)
    }
  })

  it('keeps an edge whose span is within the threshold', () => {
    const viewModels = buildGitHistoryViewModels([item('b0', ['m15']), ...chain('m', 0, 20, [])])
    const rows = buildGitGraphLaneRows(viewModels, 20, 2)
    expect(folds(rows, 'fold-down')).toEqual([])
  })

  it("pins the checked-out branch's line to the leftmost lane", () => {
    const viewModels = withHead([
      item('t0', ['m5']),
      item('t1', ['m3']),
      ...chain('h', 0, 2, ['m0']),
      ...chain('m', 0, 10, [])
    ])
    expect(getGitHistoryItemLaneIndex(viewModels[2]!)).toBe(2)
    const rows = buildGitGraphLaneRows(viewModels)
    for (let index = 2; index < rows.length; index += 1) {
      expect(rows[index]!.nodeColumn).toBe(0)
    }
  })

  it("never folds the checked-out branch's own line", () => {
    const rows = buildGitGraphLaneRows(
      withHead([item('h0', ['m0']), ...chain('o', 0, 25, ['m0']), item('m0', [])]),
      20,
      2
    )
    expect(folds(rows, 'fold-down')).toEqual([])
    expect(rows.every((row, index) => index === 0 || index === 27 || row.laneCount === 2)).toBe(
      true
    )
  })

  it('folds an edge to a commit past the loaded page, then links it once the parent loads', () => {
    const page = [item('t0', ['m40']), ...chain('m', 0, 30, ['m31'])]
    const before = buildGitGraphLaneRows(buildGitHistoryViewModels(page), 20, 2)
    expect(folds(before, 'fold-down')).toEqual([{ row: 2, target: undefined, rows: undefined }])
    expect(folds(before, 'fold-up')).toEqual([])

    const after = buildGitGraphLaneRows(
      buildGitHistoryViewModels([...page, ...chain('m', 31, 45, [])]),
      20,
      2
    )
    expect(folds(after, 'fold-down')).toEqual([{ row: 2, target: 'm40', rows: 39 }])
    expect(folds(after, 'fold-up')).toEqual([{ row: 39, target: 't0', rows: 39 }])
  })

  it('folds and restores two branches waiting on the same distant commit', () => {
    const rows = buildGitGraphLaneRows(
      buildGitHistoryViewModels([
        item('b0', ['m25']),
        item('c0', ['m25']),
        ...chain('m', 0, 30, [])
      ]),
      20,
      2
    )
    expect(folds(rows, 'fold-down').map((fold) => fold.target)).toEqual(['m25', 'm25'])
    expect(
      folds(rows, 'fold-up')
        .map((fold) => fold.target)
        .sort()
    ).toEqual(['b0', 'c0'])
    expect(rows[27]!.segments.filter((s) => s.kind === 'into-node')).toHaveLength(3)
  })
})
