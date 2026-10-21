// Fork-only: the Git Graph tab's own branch filter, kept apart from the sidebar's and saved on the tab.
import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import type { GitHistoryGraphSavedFilter } from '../../../../shared/git-history-graph-query-types'
import {
  gitGraphTabFilterKey,
  seedGitHistoryGraphFilter,
  toSavedGitHistoryGraphFilter,
  useGitHistoryGraphFilter
} from '../right-sidebar/source-control/sync/git-history-graph-filter'

/**
 * The filter key for `repoWorktreeId` in tab `fileId`. On mount the tab's saved filter replaces the
 * key's in-memory one before the first history read; every later change is saved back onto the tab.
 */
export function useGitGraphTabFilter(
  fileId: string,
  repoWorktreeId: string,
  savedFilter: GitHistoryGraphSavedFilter | undefined
): string {
  const filterKey = gitGraphTabFilterKey(fileId, repoWorktreeId)
  // Why in render: an effect would let the first history read go out with a stale filter.
  const seededKeyRef = useRef<string | null>(null)
  if (seededKeyRef.current !== filterKey) {
    seededKeyRef.current = filterKey
    if (savedFilter) {
      seedGitHistoryGraphFilter(filterKey, savedFilter)
    }
  }
  const filter = useGitHistoryGraphFilter(filterKey)
  const setGitGraphTabFilter = useAppStore((s) => s.setGitGraphTabFilter)
  useEffect(() => {
    const next = toSavedGitHistoryGraphFilter(filter)
    if (JSON.stringify(next) !== JSON.stringify(savedFilter)) {
      setGitGraphTabFilter(fileId, next)
    }
  }, [fileId, filter, savedFilter, setGitGraphTabFilter])
  return filterKey
}
