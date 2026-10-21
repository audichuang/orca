// Fork-only: feeds a Git Graph tab's pending Show in Git Graph request to the graph for its repo.
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  getGitHistoryGraphFilter,
  isGitHistoryGraphFiltered
} from '../right-sidebar/source-control/sync/git-history-graph-filter'
import { resetGitHistoryGraphFilterToDefault } from '../right-sidebar/source-control/sync/git-history-graph-query-tokens'
import {
  consumeGitGraphRevealRequest,
  peekGitGraphRevealRequest,
  requestGitGraphReveal,
  useGitGraphRevealRequest,
  type GitGraphRevealRequest
} from './git-graph-reveal-request'

export function useGitGraphTabReveal(
  fileId: string,
  repoWorktreeId: string,
  filterKey: string
): {
  request: GitGraphRevealRequest | null
  onHandled: (nonce: number, found: boolean) => void
} {
  const pending = useGitGraphRevealRequest(fileId)
  const onRevealHandled = useCallback(
    (nonce: number, found: boolean) => {
      const request = peekGitGraphRevealRequest(fileId)
      consumeGitGraphRevealRequest(fileId, nonce)
      if (found) {
        return
      }
      const commitId = request?.nonce === nonce ? request.commitId : null
      // Why offer Clear: a branch, author or path filter is the usual reason a commit is missing.
      const filtered = isGitHistoryGraphFiltered(getGitHistoryGraphFilter(filterKey), filterKey)
      toast.info(
        translate(
          'auto.components.gitGraphTab.revealNotLoaded',
          'That commit is not in the loaded history.'
        ),
        filtered && commitId
          ? {
              action: {
                label: translate(
                  'auto.components.right.sidebar.GitHistoryGraph.clearAllFilters',
                  'Clear filters'
                ),
                onClick: () => {
                  resetGitHistoryGraphFilterToDefault(filterKey)
                  requestGitGraphReveal(fileId, repoWorktreeId, commitId, { afterReload: true })
                }
              }
            }
          : undefined
      )
    },
    [fileId, filterKey, repoWorktreeId]
  )
  // Why per repo: a request made for another repo waits for the switch that remounts the graph.
  const request = pending?.repoWorktreeId === repoWorktreeId ? pending : null
  return useMemo(() => ({ request, onHandled: onRevealHandled }), [onRevealHandled, request])
}
