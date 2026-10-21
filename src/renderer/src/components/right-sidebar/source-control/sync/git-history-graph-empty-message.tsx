// Fork-only: empty-state text for the Commits graph that tells a filtered miss from an empty repo.
import React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  isGitHistoryGraphFiltered,
  updateGitHistoryGraphFilter,
  useGitHistoryGraphFilter
} from './git-history-graph-filter'
import { resetGitHistoryGraphFilterToDefault } from './git-history-graph-query-tokens'

export function GitHistoryGraphEmptyMessage({
  worktreeId,
  filterActions = false
}: {
  /** The filter key: a worktree id, or a Git Graph tab's own key. */
  worktreeId: string
  /** Offer ways out of a filter that matches nothing (the full view has room for them). */
  filterActions?: boolean
}): React.JSX.Element {
  const filter = useGitHistoryGraphFilter(worktreeId)
  const filtered = isGitHistoryGraphFiltered(filter, worktreeId)
  if (!filtered) {
    return (
      <>{translate('auto.components.right.sidebar.GitHistoryPanel.cf7cad58d2', 'No commits yet')}</>
    )
  }
  const message = translate(
    'auto.components.right.sidebar.GitHistoryGraph.noMatchingCommits',
    'No commits match this filter'
  )
  if (!filterActions) {
    return <>{message}</>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{message}</span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => resetGitHistoryGraphFilterToDefault(worktreeId)}
      >
        {translate(
          'auto.components.right.sidebar.GitHistoryGraph.clearAllFilters',
          'Clear filters'
        )}
      </Button>
      {filter.scope !== 'all' && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            updateGitHistoryGraphFilter(worktreeId, {
              scope: 'all',
              refs: [],
              local: true,
              remotes: 'all'
            })
          }
        >
          {translate(
            'auto.components.right.sidebar.GitHistoryGraph.showAllBranches',
            'Show all branches'
          )}
        </Button>
      )}
    </div>
  )
}
