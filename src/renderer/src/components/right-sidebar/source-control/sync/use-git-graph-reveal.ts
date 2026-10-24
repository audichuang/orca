// Fork-only: a one-shot "select this commit" request for the full Git Graph (Show in Git Graph).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GitHistoryResult } from '../../../../../../shared/git-history'
import { GIT_HISTORY_GRAPH_MAX_LIMIT } from '../../../../../../shared/git-history-graph-query-types'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  getGitHistoryGraphFilter,
  isGitHistoryGraphFiltered,
  updateGitHistoryGraphFilter
} from './git-history-graph-filter'
import { resetGitHistoryGraphFilterToDefault } from './git-history-graph-query-tokens'

export type GitGraphRevealTarget = {
  commitId: string
  nonce: number
  /** The loaded page predates a pending reload, so a miss there is not judged. */
  afterReload?: boolean
  /** Move keyboard focus to the row once selected. */
  focus?: boolean
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
  jumpTo: (commitId: string, options?: { focus?: boolean }) => void
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
      jumpTo(request.commitId, request.focus ? { focus: true } : undefined)
    }
    onHandled(request.nonce, found)
  }, [filterKey, jumpTo, onHandled, request, result, settled])
  return request !== null
}

/** Tells the user a revealed commit is not in the loaded history; offers Clear filters when a retry can follow. */
export function notifyGitGraphRevealMissing(filterKey: string, retry?: () => void): void {
  // Why offer Clear: a branch, author or path filter is the usual reason a commit is missing.
  const filtered = isGitHistoryGraphFiltered(getGitHistoryGraphFilter(filterKey), filterKey)
  toast.info(
    translate(
      'auto.components.gitGraphTab.revealNotLoaded',
      'That commit is not in the loaded history.'
    ),
    filtered && retry
      ? {
          action: {
            label: translate(
              'auto.components.right.sidebar.GitHistoryGraph.clearAllFilters',
              'Clear filters'
            ),
            onClick: () => {
              resetGitHistoryGraphFilterToDefault(filterKey)
              retry()
            }
          }
        }
      : undefined
  )
}

type GitGraphHostReveal = Pick<GitGraphRevealOptions, 'request' | 'onHandled'>

/**
 * Adds the view's own reveals (a fold arrow toward a commit past the loaded page) to the host's.
 * The host's request goes first; the view's waits behind it.
 */
export function useGitGraphViewReveal(
  host: GitGraphHostReveal | undefined,
  filterKey: string
): {
  reveal: GitGraphHostReveal
  revealCommit: (commitId: string) => void
} {
  const [local, setLocal] = useState<GitGraphRevealTarget | null>(null)
  // Why negative: host nonces count up from 1, and the reveal hook skips a nonce it already handled.
  const nextNonceRef = useRef(-1)
  const request = useCallback((commitId: string, afterReload: boolean) => {
    setLocal({ commitId, nonce: nextNonceRef.current--, focus: true, afterReload })
  }, [])
  const notifyMissing = useCallback(
    (commitId: string) => notifyGitGraphRevealMissing(filterKey, () => request(commitId, true)),
    [filterKey, request]
  )
  const revealCommit = useCallback((commitId: string) => request(commitId, false), [request])
  const hostOnHandled = host?.onHandled
  const onHandled = useCallback(
    (nonce: number, found: boolean) => {
      if (nonce >= 0) {
        hostOnHandled?.(nonce, found)
        return
      }
      if (local?.nonce !== nonce) {
        return
      }
      setLocal(null)
      if (!found) {
        notifyMissing(local.commitId)
      }
    },
    [hostOnHandled, local, notifyMissing]
  )
  const shown = host?.request ?? local
  const reveal = useMemo(() => ({ request: shown, onHandled }), [shown, onHandled])
  return { reveal, revealCommit }
}
