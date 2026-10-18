// Fork-only: empty-state text for the Commits graph that tells a filtered miss from an empty repo.
import React from 'react'
import { translate } from '@/i18n/i18n'
import { isGitHistoryGraphFiltered, useGitHistoryGraphFilter } from './git-history-graph-filter'

export function GitHistoryGraphEmptyMessage({
  worktreeId
}: {
  worktreeId: string
}): React.JSX.Element {
  const filter = useGitHistoryGraphFilter(worktreeId)
  return (
    <>
      {isGitHistoryGraphFiltered(filter)
        ? translate(
            'auto.components.right.sidebar.GitHistoryGraph.noMatchingCommits',
            'No commits match this filter'
          )
        : translate('auto.components.right.sidebar.GitHistoryPanel.cf7cad58d2', 'No commits yet')}
    </>
  )
}
