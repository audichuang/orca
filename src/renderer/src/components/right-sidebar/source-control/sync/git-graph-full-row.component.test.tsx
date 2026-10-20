// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import { GitGraphFullRow } from './git-graph-full-row'

const COLUMNS = { refs: true, author: true, date: true, hash: true }

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
