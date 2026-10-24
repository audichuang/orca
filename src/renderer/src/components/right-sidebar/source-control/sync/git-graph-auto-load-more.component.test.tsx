// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import { GitGraphAutoLoadMore } from './git-graph-auto-load-more'
import type { GitHistoryPanelState } from './git-history-panel'
import {
  getGitHistoryGraphFilter,
  gitGraphTabFilterKey,
  resetGitHistoryGraphFiltersForTest,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'

const KEY = gitGraphTabFilterKey('tab', 'wt')

let intersect: ((visible: boolean) => void) | null = null

beforeEach(() => {
  intersect = null
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (visible) => callback([{ isIntersecting: visible }])
      }
      observe(): void {}
      disconnect(): void {
        intersect = null
      }
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetGitHistoryGraphFiltersForTest()
})

function page(count: number, hasMore: boolean): GitHistoryResult {
  const items = Array.from({ length: count }, (_, i): GitHistoryItem => ({
    id: `c${i}`,
    parentIds: [],
    subject: `c${i}`,
    message: `c${i}`
  }))
  return {
    items,
    hasIncomingChanges: false,
    hasOutgoingChanges: false,
    hasMore,
    limit: count,
    graph: { mode: 'all', refs: [], remotes: [], limit: count }
  }
}

function renderFooter(state: GitHistoryPanelState): ReturnType<typeof render> {
  return render(<GitGraphAutoLoadMore worktreeId={KEY} state={state} scrollRootRef={createRef()} />)
}

describe('GitGraphAutoLoadMore', () => {
  it('raises the page once the end of the list scrolls near, and not again while it loads', () => {
    const view = renderFooter({ status: 'ready', result: page(50, true) })
    act(() => intersect?.(true))
    expect(getGitHistoryGraphFilter(KEY).limit).toBe(150)

    view.rerender(
      <GitGraphAutoLoadMore
        worktreeId={KEY}
        state={{ status: 'refreshing', result: page(50, true) }}
        scrollRootRef={createRef()}
      />
    )
    expect(intersect).toBeNull()
    expect(screen.getByText('Loading more commits...')).toBeInTheDocument()
  })

  it('stays put when the last page came back short', () => {
    renderFooter({ status: 'ready', result: page(30, false) })
    expect(intersect).toBeNull()
    expect(getGitHistoryGraphFilter(KEY).limit).toBe(50)
  })

  it('says so at the cap instead of stopping silently', () => {
    updateGitHistoryGraphFilter(KEY, { limit: 1000 })
    renderFooter({ status: 'ready', result: page(1000, true) })
    expect(intersect).toBeNull()
    expect(screen.getByText(/Showing the first 1000 commits/)).toBeInTheDocument()
  })

  it('leaves a host that ignores the graph request to the plain notice', () => {
    const result = { ...page(50, true), graph: undefined }
    const { container } = renderFooter({ status: 'ready', result })
    expect(intersect).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })
})
