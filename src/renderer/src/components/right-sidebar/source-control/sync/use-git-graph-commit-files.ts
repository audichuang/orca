// Fork-only: loads the changed files of the full Git Graph's selected commits.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { GitHistoryCommitFilesState } from './git-history-commit-files'

// Why bounded: a Shift range can cover hundreds of commits; the runtime RPC queue rejects past 256.
const FILE_LOAD_CONCURRENCY = 6

export function useGitGraphCommitFiles(
  result: GitHistoryResult | undefined,
  shownItems: readonly GitHistoryItem[],
  onLoadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
): Record<string, GitHistoryCommitFilesState> {
  const [filesByCommit, setFilesByCommit] = useState<Record<string, GitHistoryCommitFilesState>>({})
  const requestedRef = useRef(new Set<string>())
  // Why: a new result can replace commits; drop cached lists like the sidebar panel does.
  const [shownResult, setShownResult] = useState(result)
  if (shownResult !== result) {
    setShownResult(result)
    setFilesByCommit({})
    requestedRef.current = new Set()
  }
  const ensureFiles = useCallback(
    (item: GitHistoryItem): void => {
      const requested = requestedRef.current
      if (requested.has(item.id)) {
        return
      }
      requested.add(item.id)
      setFilesByCommit((prev) => ({ ...prev, [item.id]: { status: 'loading' } }))
      onLoadCommitFiles(item)
        .then((entries) => {
          if (requestedRef.current === requested) {
            setFilesByCommit((prev) => ({ ...prev, [item.id]: { status: 'ready', entries } }))
          }
        })
        .catch((error: unknown) => {
          if (requestedRef.current !== requested) {
            return
          }
          requested.delete(item.id)
          const message = error instanceof Error ? error.message : String(error)
          setFilesByCommit((prev) => ({ ...prev, [item.id]: { status: 'error', error: message } }))
        })
    },
    [onLoadCommitFiles]
  )
  // Why an effect: a refresh drops the file cache but keeps the selection, so it must refetch too.
  useEffect(() => {
    const inFlight = shownItems.filter((item) => filesByCommit[item.id]?.status === 'loading')
    const missing = shownItems.filter((item) => !filesByCommit[item.id])
    for (const item of missing.slice(0, Math.max(0, FILE_LOAD_CONCURRENCY - inFlight.length))) {
      ensureFiles(item)
    }
  }, [shownItems, filesByCommit, ensureFiles])
  return filesByCommit
}
