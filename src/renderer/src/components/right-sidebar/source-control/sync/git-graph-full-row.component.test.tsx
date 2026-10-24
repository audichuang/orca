// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import { getUiRelativeTimeFormatter } from '@/i18n/relative-time-format'
import { formatGitGraphCompactDate } from './git-graph-date-format'
import { GitGraphFullRow } from './git-graph-full-row'
import type { GitGraphLaneRow } from './git-graph-lane-layout'

const COLUMNS = { refs: true, author: true, date: true, hash: true }
const LANES: GitGraphLaneRow = {
  nodeColumn: 0,
  nodeColor: 'git-graph-ref',
  laneCount: 1,
  segments: []
}

function viewModel(
  kind: GitHistoryItemViewModel['kind'],
  displayId: string
): GitHistoryItemViewModel {
  return {
    historyItem: {
      id: `${kind}-id`,
      displayId,
      parentIds: [],
      subject: `${kind} subject`,
      message: `${kind} subject`
    },
    inputSwimlanes: [],
    outputSwimlanes: [],
    kind
  }
}

afterEach(() => cleanup())

describe('GitGraphFullRow hash column', () => {
  it('leaves the hash cell empty on boundary rows but keeps the cell for alignment', () => {
    render(
      <GitGraphFullRow
        viewModel={viewModel('outgoing-changes', '0000000')}
        lanes={LANES}
        graphWidth={24}
        columns={COLUMNS}
        selected={false}
        onSelect={() => {}}
      />
    )
    const row = screen.getByTestId('git-graph-full-row')
    expect(row.querySelector('[data-col="hash"]')).toBeEmptyDOMElement()
    expect(row).not.toHaveTextContent('0000000')
  })

  it('shows the short hash on commit rows', () => {
    render(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={LANES}
        graphWidth={24}
        columns={COLUMNS}
        selected={false}
        onSelect={() => {}}
      />
    )
    expect(
      screen.getByTestId('git-graph-full-row').querySelector('[data-col="hash"]')
    ).toHaveTextContent('abc1234')
  })
})

describe('GitGraphFullRow taller rows', () => {
  it('floats the whole subject over the rows below only for an expanded, cut-off row', () => {
    // Why stub: happy-dom has no layout, so the line never measures as cut off on its own.
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(400)
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    try {
      const row = (expanded: boolean): React.JSX.Element => (
        <GitGraphFullRow
          viewModel={viewModel('node', 'abc1234')}
          lanes={LANES}
          graphWidth={24}
          columns={COLUMNS}
          selected
          expanded={expanded}
          onSelect={() => {}}
        />
      )
      const { rerender } = render(row(true))
      const overlay = (): HTMLElement | null =>
        screen.getByTestId('git-graph-full-row').querySelector('[data-subject-overlay]')
      expect(overlay()).toHaveTextContent('node subject')
      // The rows it covers keep taking clicks, and the row itself keeps one truncated line.
      expect(overlay()).toHaveClass('pointer-events-none', 'whitespace-normal')
      expect(screen.getByTitle('node subject')).toHaveClass('truncate')
      rerender(row(false))
      expect(overlay()).toBeNull()

      client.mockReturnValue(400)
      rerender(row(true))
      expect(overlay()).toBeNull()
    } finally {
      scroll.mockRestore()
      client.mockRestore()
    }
  })

  it('runs lanes from the row top into the band and from the band to the row bottom', () => {
    const lanes: GitGraphLaneRow = {
      nodeColumn: 0,
      nodeColor: 'git-graph-ref',
      laneCount: 2,
      segments: [
        { kind: 'into-node', from: 0, color: 'git-graph-ref' },
        { kind: 'out-of-node', to: 0, color: 'git-graph-ref' },
        { kind: 'through', from: 1, to: 1, color: 'git-graph-lane-2' }
      ]
    }
    render(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={lanes}
        graphWidth={33}
        columns={COLUMNS}
        selected={false}
        onSelect={() => {}}
      />
    )
    const connectors = Array.from(
      screen
        .getByTestId('git-graph-full-row')
        .querySelectorAll<HTMLElement>('[data-lane-connector]')
    )
    // Into the band: the commit's own lane and the passing one; out of it: both again, to the
    // row's bottom edge whatever height the row ends up with.
    expect(connectors.filter((line) => line.style.top === '0px')).toHaveLength(2)
    const down = connectors.filter((line) => line.style.bottom === '0px')
    expect(down).toHaveLength(2)
    expect(down.map((line) => line.style.left).sort()).toEqual(['10.5px', '21.5px'])
  })
})

describe('GitGraphFullRow folded edges', () => {
  const target = {
    id: 'far-parent',
    displayId: 'f00d123',
    parentIds: [],
    subject: 'far',
    message: 'far'
  }
  const lanes: GitGraphLaneRow = {
    nodeColumn: 0,
    nodeColor: 'git-graph-ref',
    laneCount: 2,
    segments: [{ kind: 'fold-down', at: 1, color: 'git-graph-lane-1', target, rows: 30 }]
  }

  it('jumps to the far end on an arrow click instead of selecting the row', () => {
    const onSelect = vi.fn()
    const onJump = vi.fn()
    render(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={lanes}
        graphWidth={33}
        columns={COLUMNS}
        selected={false}
        onSelect={onSelect}
        onJump={onJump}
      />
    )
    const row = screen.getByTestId('git-graph-full-row')
    const arrow = row.querySelector('[data-git-graph-jump="far-parent"] path')!
    expect(row.querySelector('[data-fold="fold-down"] title')).toHaveTextContent('f00d123')
    fireEvent.click(arrow)
    expect(onJump).toHaveBeenCalledWith('far-parent')
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(row.querySelector('[data-col="message"]')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onJump).toHaveBeenCalledTimes(1)
  })

  it('does not open the row commit on an arrow double-click', () => {
    const onOpen = vi.fn()
    render(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={lanes}
        graphWidth={33}
        columns={COLUMNS}
        selected={false}
        onSelect={vi.fn()}
        onJump={vi.fn()}
        onOpen={onOpen}
      />
    )
    const row = screen.getByTestId('git-graph-full-row')
    fireEvent.doubleClick(row.querySelector('[data-fold="fold-down"] path')!)
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.doubleClick(row.querySelector('[data-col="message"]')!)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('ignores a click on an arrow whose far end is not loaded yet', () => {
    const onSelect = vi.fn()
    const onJump = vi.fn()
    render(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={{
          ...lanes,
          segments: [{ kind: 'fold-down', at: 1, color: 'git-graph-lane-1' }]
        }}
        graphWidth={33}
        columns={COLUMNS}
        selected={false}
        onSelect={onSelect}
        onJump={onJump}
      />
    )
    const row = screen.getByTestId('git-graph-full-row')
    expect(row.querySelector('[data-fold="fold-down"] title')).toHaveTextContent(
      'Load more commits'
    )
    fireEvent.click(row.querySelector('[data-fold="fold-down"] path')!)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onJump).not.toHaveBeenCalled()
  })

  it('loads toward an arrow whose far end is past the loaded commits', () => {
    const onJump = vi.fn()
    render(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={{
          ...lanes,
          segments: [
            { kind: 'fold-down', at: 1, color: 'git-graph-lane-1', unloadedTargetId: 'deep123' }
          ]
        }}
        graphWidth={33}
        columns={COLUMNS}
        selected={false}
        onSelect={vi.fn()}
        onJump={onJump}
      />
    )
    const row = screen.getByTestId('git-graph-full-row')
    expect(row.querySelector('[data-fold="fold-down"] title')).toHaveTextContent('deep123')
    fireEvent.click(row.querySelector('[data-git-graph-jump="deep123"] path')!)
    expect(onJump).toHaveBeenCalledWith('deep123')
  })

  it('jumps from an arrow drawn on a boundary row', () => {
    const onJump = vi.fn()
    render(
      <GitGraphFullRow
        viewModel={viewModel('incoming-changes', '0000000')}
        lanes={lanes}
        graphWidth={33}
        columns={COLUMNS}
        selected={false}
        onSelect={vi.fn()}
        onJump={onJump}
      />
    )
    fireEvent.click(
      screen
        .getByTestId('git-graph-full-row')
        .querySelector('[data-git-graph-jump="far-parent"] path')!
    )
    expect(onJump).toHaveBeenCalledWith('far-parent')
  })
})

describe('GitGraphFullRow message room', () => {
  const longRefs = (headName: string, otherName: string): GitHistoryItemViewModel => {
    const vm = viewModel('node', 'abc1234')
    return {
      ...vm,
      historyItem: {
        ...vm.historyItem,
        references: [
          { id: 'refs/heads/head', name: headName, category: 'branches' },
          { id: 'refs/heads/other', name: otherName, category: 'branches' }
        ]
      }
    }
  }

  it('caps a ref chip width and keeps its full name in the tooltip', () => {
    const name = 'feature/a-very-long-branch-name-that-would-push-the-message-out'
    render(
      <GitGraphFullRow
        viewModel={longRefs(name, 'other')}
        lanes={LANES}
        graphWidth={24}
        columns={COLUMNS}
        selected={false}
        onSelect={() => {}}
      />
    )
    const chip = screen.getByTitle(`${name} (branches)`)
    expect(chip).toHaveClass('max-w-32')
    expect(chip).not.toHaveAttribute('data-head-ref')
  })

  it('gives the checked-out branch chip a slightly larger cap', () => {
    const name = 'feature/another-very-long-branch-name-on-head'
    render(
      <GitGraphFullRow
        viewModel={longRefs(name, 'other')}
        lanes={LANES}
        graphWidth={24}
        columns={COLUMNS}
        selected={false}
        headRefId="refs/heads/head"
        onSelect={() => {}}
      />
    )
    const chip = screen.getByTitle(`${name} (branches)`)
    expect(chip).toHaveAttribute('data-head-ref', 'true')
    expect(chip).toHaveClass('max-w-40')
  })

  it('keeps off-branch messages readable while current-branch rows stay primary', () => {
    const { rerender } = render(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={LANES}
        graphWidth={24}
        columns={COLUMNS}
        selected={false}
        dimmed
        onSelect={() => {}}
      />
    )
    const message = (): HTMLElement => screen.getByTitle('node subject')
    expect(message()).toHaveClass('text-foreground/80')
    expect(message()).not.toHaveClass('text-muted-foreground')

    rerender(
      <GitGraphFullRow
        viewModel={viewModel('node', 'abc1234')}
        lanes={LANES}
        graphWidth={24}
        columns={COLUMNS}
        selected={false}
        onSelect={() => {}}
      />
    )
    expect(message()).toHaveClass('text-foreground')
    expect(message()).not.toHaveClass('text-foreground/80')
  })
})

describe('formatGitGraphCompactDate', () => {
  const now = new Date(2026, 9, 23, 1, 30)
  const words = getUiRelativeTimeFormatter()

  it('names today and yesterday by calendar day, not by 24-hour distance', () => {
    expect(formatGitGraphCompactDate(new Date(2026, 9, 23, 0, 5).getTime(), now)).toMatch(
      new RegExp(`^${words.format(0, 'day')} `, 'i')
    )
    expect(formatGitGraphCompactDate(new Date(2026, 9, 22, 23, 20).getTime(), now)).toMatch(
      new RegExp(`^${words.format(-1, 'day')} `, 'i')
    )
    expect(formatGitGraphCompactDate(new Date(2026, 9, 21, 23, 59).getTime(), now)).not.toMatch(
      new RegExp(`^${words.format(-1, 'day')}`, 'i')
    )
  })

  it('drops the year this year and the time in older years, each at one width', () => {
    const thisYear = [new Date(2026, 9, 5, 7, 41), new Date(2026, 0, 18, 20, 3)].map((date) =>
      formatGitGraphCompactDate(date.getTime(), now)
    )
    expect(thisYear.every((text) => !text.includes('2026'))).toBe(true)
    expect(thisYear[1]).toContain('20:03')
    expect(new Set(thisYear.map((text) => text.length)).size).toBe(1)
    const older = [new Date(2025, 11, 30, 17, 53), new Date(2024, 2, 4, 9, 7)].map((date) =>
      formatGitGraphCompactDate(date.getTime(), now)
    )
    expect(older[0]).toContain('2025')
    expect(older[0]).not.toContain('17:53')
    expect(new Set(older.map((text) => text.length)).size).toBe(1)
  })
})
