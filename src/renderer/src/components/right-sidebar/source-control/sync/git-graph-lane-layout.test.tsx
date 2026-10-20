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
import { GitHistoryGraphSvg } from './git-history-graph-svg'

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

function drawing(markup: string): string[] {
  return [...markup.matchAll(/<(path|circle)\b[^>]*>/g)].map((match) => match[0]).sort()
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

describe('buildGitGraphLaneRows', () => {
  it('draws exactly what the upstream renderer draws when nothing folds or pins', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const viewModels = buildGitHistoryViewModels(randomHistory(seed, 60))
      const rows = buildGitGraphLaneRows(viewModels, Number.POSITIVE_INFINITY)
      viewModels.forEach((viewModel, index) => {
        expect(rows[index]!.nodeColumn).toBe(getGitHistoryItemLaneIndex(viewModel))
        expect(
          drawing(
            renderToStaticMarkup(<GitGraphLaneSvg viewModel={viewModel} lanes={rows[index]!} />)
          )
        ).toEqual(drawing(renderToStaticMarkup(<GitHistoryGraphSvg viewModel={viewModel} />)))
      })
    }
  })

  it('draws the incoming and outgoing boundary rows like upstream, with HEAD pinned', () => {
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
      viewModels.forEach((viewModel, index) => {
        expect(
          drawing(
            renderToStaticMarkup(<GitGraphLaneSvg viewModel={viewModel} lanes={rows[index]!} />)
          )
        ).toEqual(drawing(renderToStaticMarkup(<GitHistoryGraphSvg viewModel={viewModel} />)))
      })
    }
  })

  it('folds a long edge into stubs that point at each other and frees its lane between them', () => {
    const viewModels = buildGitHistoryViewModels([item('b0', ['m30']), ...chain('m', 0, 40, [])])
    const rows = buildGitGraphLaneRows(viewModels, 20, 2)

    expect(folds(rows, 'fold-down')).toEqual([{ row: 2, target: 'm30', rows: 29 }])
    expect(folds(rows, 'fold-up')).toEqual([{ row: 29, target: 'b0', rows: 29 }])
    expect(Math.max(...rows.slice(3, 29).map((row) => row.laneCount))).toBe(1)
    expect(rows[31]!.segments.filter((s) => s.kind === 'into-node')).toHaveLength(2)
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
