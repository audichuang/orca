// Fork-only: a one-shot "select this commit" request for the full Git Graph (Show in Git Graph).
import { useEffect, useRef } from 'react'
import type { GitHistoryResult } from '../../../../../../shared/git-history'
import { GIT_HISTORY_GRAPH_MAX_LIMIT } from '../../../../../../shared/git-history-graph-query-types'
import { getGitHistoryGraphFilter, updateGitHistoryGraphFilter } from './git-history-graph-filter'

export type GitGraphRevealTarget = {
  commitId: string
  nonce: number
  /** The loaded page predates a pending reload, so a miss there is not judged. */
  afterReload?: boolean
}

export type GitGraphRevealOptions = {
  request: GitGraphRevealTarget | null
  /** False while history is (re)loading, so a commit missing from a stale page is not judged yet. */
  settled: boolean
  /**
   * Must clear `request`: it stays pending (holding off the checked-out pick) until it does.
   * `found` is false when the commit is not in the loaded history; the selection is left alone.
   */
  onHandled: (nonce: number, found: boolean) => void
  /** The graph's filter key; its limit is raised when the commit may be past the loaded page. */
  filterKey?: string
}

// Why straight to the cap: one deeper read decides it, rather than a read per page.
function deepenGitGraphForReveal(filterKey: string): boolean {
  if (getGitHistoryGraphFilter(filterKey).limit >= GIT_HISTORY_GRAPH_MAX_LIMIT) {
    return false
  }
  updateGitHistoryGraphFilter(filterKey, { limit: GIT_HISTORY_GRAPH_MAX_LIMIT })
  return true
}

/** Selects the requested commit once it is loaded; true while a request still waits for history. */
export function useGitGraphReveal(
  reveal: GitGraphRevealOptions | undefined,
  result: GitHistoryResult | undefined,
  jumpTo: (commitId: string) => void
): boolean {
  const request = reveal?.request ?? null
  const settled = reveal?.settled ?? true
  const onHandled = reveal?.onHandled
  const filterKey = reveal?.filterKey
  // Why: the host clears the request a render later; this keeps the effect from handling it twice.
  const handledNonceRef = useRef<number | null>(null)
  // A request waiting on a reload (a deeper page, or its own), and whether that reload has started.
  const deepeningRef = useRef<{ nonce: number; reloading: boolean } | null>(null)
  useEffect(() => {
    if (!request || !onHandled || handledNonceRef.current === request.nonce || !result) {
      return
    }
    const found = result.items.some((item) => item.id === request.commitId)
    if (request.afterReload && deepeningRef.current?.nonce !== request.nonce) {
      deepeningRef.current = { nonce: request.nonce, reloading: false }
    }
    if (!found) {
      const deepening = deepeningRef.current?.nonce === request.nonce ? deepeningRef.current : null
      if (!settled) {
        if (deepening) {
          deepening.reloading = true
        }
        return
      }
      // Why: until the deeper read starts, the settled page is still the one already searched.
      if (deepening && !deepening.reloading) {
        return
      }
      if (result.hasMore && filterKey && deepenGitGraphForReveal(filterKey)) {
        deepeningRef.current = { nonce: request.nonce, reloading: false }
        return
      }
    }
    deepeningRef.current = null
    handledNonceRef.current = request.nonce
    if (found) {
      jumpTo(request.commitId)
    }
    onHandled(request.nonce, found)
  }, [filterKey, jumpTo, onHandled, request, result, settled])
  return request !== null
}
