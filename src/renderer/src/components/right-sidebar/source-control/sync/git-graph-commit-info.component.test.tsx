// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import { GitGraphCommitInfo, type GitGraphCommitContext } from './git-graph-commit-info'

function commit(id: string, parentIds: string[]): GitHistoryItem {
  return { id, displayId: id.slice(0, 7), parentIds, subject: `subject ${id}`, message: id }
}

afterEach(() => cleanup())

describe('GitGraphCommitInfo children', () => {
  it('links to loaded children so the keyboard can follow an edge upward', () => {
    const parent = commit('parent0000', [])
    const child = commit('child00000', ['parent0000'])
    const other = commit('other00000', [])
    const onJump = vi.fn()
    const context: GitGraphCommitContext = {
      itemsById: new Map([child, parent, other].map((c) => [c.id, c])),
      containment: new Map(),
      branchNames: new Map(),
      refColors: new Map(),
      onJump
    }
    render(<GitGraphCommitInfo item={parent} context={context} />)

    expect(screen.getByText('Children')).toBeInTheDocument()
    const link = screen.getByRole('button', { name: 'child00' })
    expect(screen.queryByRole('button', { name: 'other00' })).not.toBeInTheDocument()
    fireEvent.click(link)
    expect(onJump).toHaveBeenCalledWith('child00000')
  })

  it('omits the row when nothing loaded descends from the commit', () => {
    const tip = commit('tip0000000', [])
    render(
      <GitGraphCommitInfo
        item={tip}
        context={{
          itemsById: new Map([[tip.id, tip]]),
          containment: new Map(),
          branchNames: new Map(),
          refColors: new Map(),
          onJump: vi.fn()
        }}
      />
    )
    expect(screen.queryByText('Children')).not.toBeInTheDocument()
  })
})
