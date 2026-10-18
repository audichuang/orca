// Fork-only: whether the Commits graph's host applied the filter, plus the load-more footer that depends on it.
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { GIT_HISTORY_GRAPH_MAX_LIMIT } from '../../../../../../shared/git-history-graph-query-types'
import type { GitHistoryPanelState } from './git-history-panel'
import {
  toGitHistoryGraphRequest,
  updateGitHistoryGraphFilter,
  useGitHistoryGraphFilter
} from './git-history-graph-filter'

const LOAD_MORE_STEP = 100

export function hostTooOldText(): string {
  return translate(
    'auto.components.right.sidebar.GitHistoryGraph.hostTooOld',
    'This repository host runs an older Orca that only shows the current branch.'
  )
}

/**
 * `hostTooOld` only when the shown result answers the current filter: while a refetch is in
 * flight the previous plain-history result is still on screen and must not read as an old host.
 */
export function useGitHistoryGraphHostStatus(
  worktreeId: string,
  state: GitHistoryPanelState
): { hostTooOld: boolean; error: string | undefined } {
  const filter = useGitHistoryGraphFilter(worktreeId)
  const request = toGitHistoryGraphRequest(filter)
  const requestKey = JSON.stringify(request ?? null)
  const [stamp, setStamp] = useState({ result: state.result, requestKey })
  if (stamp.result !== state.result) {
    setStamp({ result: state.result, requestKey })
  }
  const answersCurrentFilter = stamp.result !== state.result || stamp.requestKey === requestKey
  return {
    hostTooOld: Boolean(request && state.result && !state.result.graph && answersCurrentFilter),
    error: request && state.status === 'error' ? state.error : undefined
  }
}

export function GitHistoryGraphHostNotice({
  worktreeId,
  state
}: {
  worktreeId: string
  state: GitHistoryPanelState
}): React.JSX.Element | null {
  const { hostTooOld, error } = useGitHistoryGraphHostStatus(worktreeId, state)
  if (!hostTooOld && !error) {
    return null
  }
  return <p className="text-2xs text-muted-foreground">{error ?? hostTooOldText()}</p>
}

/** Grows the page without --skip, so lanes stay continuous across the whole list. */
export function GitHistoryGraphLoadMore({
  worktreeId,
  state
}: {
  worktreeId: string
  state: GitHistoryPanelState
}): React.JSX.Element | null {
  const filter = useGitHistoryGraphFilter(worktreeId)
  const { hostTooOld } = useGitHistoryGraphHostStatus(worktreeId, state)
  const result = state.result
  // Why hostTooOld: an old host ignores the larger limit, so the button would never grow the list.
  if (!result?.hasMore || hostTooOld || filter.limit >= GIT_HISTORY_GRAPH_MAX_LIMIT) {
    return null
  }
  return (
    <div className="px-3 py-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="w-full"
        onClick={() =>
          updateGitHistoryGraphFilter(worktreeId, {
            limit: Math.min(GIT_HISTORY_GRAPH_MAX_LIMIT, result.items.length + LOAD_MORE_STEP)
          })
        }
      >
        {translate('auto.components.right.sidebar.GitHistoryGraph.loadMore', 'Load more commits')}
      </Button>
    </div>
  )
}
