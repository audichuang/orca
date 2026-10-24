// Fork-only: feeds a Git Graph tab's pending Show in Git Graph request to the graph for its repo.
import { useCallback, useMemo } from 'react'
import { notifyGitGraphRevealMissing } from '../right-sidebar/source-control/sync/use-git-graph-reveal'
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
      notifyGitGraphRevealMissing(
        filterKey,
        commitId
          ? () => requestGitGraphReveal(fileId, repoWorktreeId, commitId, { afterReload: true })
          : undefined
      )
    },
    [fileId, filterKey, repoWorktreeId]
  )
  // Why per repo: a request made for another repo waits for the switch that remounts the graph.
  const request = pending?.repoWorktreeId === repoWorktreeId ? pending : null
  return useMemo(() => ({ request, onHandled: onRevealHandled }), [onRevealHandled, request])
}
