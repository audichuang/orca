// Fork-only: the full Git Graph's list footer, which loads the next page as it scrolls into view.
import React, { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { GIT_HISTORY_GRAPH_MAX_LIMIT } from '../../../../../../shared/git-history-graph-query-types'
import type { GitHistoryPanelState } from './git-history-panel'
import { updateGitHistoryGraphFilter, useGitHistoryGraphFilter } from './git-history-graph-filter'
import {
  GitHistoryGraphLoadMore,
  LOAD_MORE_STEP,
  useGitHistoryGraphHostStatus
} from './git-history-graph-host-status'

/** How far below the visible rows the next page starts loading. */
const AUTO_LOAD_MARGIN_PX = 300

export function GitGraphAutoLoadMore({
  worktreeId,
  state,
  scrollRootRef
}: {
  worktreeId: string
  state: GitHistoryPanelState
  scrollRootRef: React.RefObject<HTMLElement | null>
}): React.JSX.Element | null {
  const filter = useGitHistoryGraphFilter(worktreeId)
  const { hostTooOld } = useGitHistoryGraphHostStatus(worktreeId, state)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const result = state.result
  const loaded = result?.items.length ?? 0
  const atCap = filter.limit >= GIT_HISTORY_GRAPH_MAX_LIMIT
  // Why `loaded >= limit`: a page that came back short has nothing past it, and a raised limit
  // still being read must not raise it again.
  const canLoad =
    Boolean(result?.hasMore) &&
    !hostTooOld &&
    !atCap &&
    state.status === 'ready' &&
    loaded >= filter.limit

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!canLoad || !sentinel || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          updateGitHistoryGraphFilter(worktreeId, {
            limit: Math.min(GIT_HISTORY_GRAPH_MAX_LIMIT, loaded + LOAD_MORE_STEP)
          })
        }
      },
      { root: scrollRootRef.current, rootMargin: `0px 0px ${AUTO_LOAD_MARGIN_PX}px 0px` }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canLoad, loaded, scrollRootRef, worktreeId])

  if (!result || hostTooOld) {
    return null
  }
  if (state.status === 'refreshing' && filter.limit > loaded) {
    return (
      <p
        className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground"
        data-git-graph-auto-load="loading"
      >
        <RefreshCw className="size-3 animate-spin" />
        {translate(
          'auto.components.right.sidebar.GitGraphFullView.loadingMore',
          'Loading more commits...'
        )}
      </p>
    )
  }
  if (atCap && result.hasMore) {
    return (
      <p
        className="px-3 py-1.5 text-center text-xs text-muted-foreground"
        data-git-graph-auto-load="cap"
      >
        {translate(
          'auto.components.right.sidebar.GitGraphFullView.loadCapReached',
          'Showing the first {{count}} commits, the most the graph loads. Narrow it with Branch, User or Paths.',
          { count: GIT_HISTORY_GRAPH_MAX_LIMIT }
        )}
      </p>
    )
  }
  return (
    <div data-git-graph-auto-load="idle">
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
      <GitHistoryGraphLoadMore worktreeId={worktreeId} state={state} />
    </div>
  )
}
