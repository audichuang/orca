// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
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
})
