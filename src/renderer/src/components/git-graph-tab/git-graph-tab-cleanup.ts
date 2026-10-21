// Fork-only: frees a closed Git Graph tab's in-memory state; a reopen restores from the tab's saved filter.
import { forgetGitGraphTabFilters } from '../right-sidebar/source-control/sync/git-history-graph-filter'
import { forgetGitGraphTabQueryMemory } from '../right-sidebar/source-control/sync/git-history-graph-query-tokens'
import { forgetGitGraphRevealRequest } from './git-graph-reveal-request'

export function forgetClosedGitGraphTabs(files: readonly { id: string; mode?: string }[]): void {
  for (const file of files) {
    if (file.mode === 'git-graph') {
      forgetGitGraphTabFilters(file.id)
      forgetGitGraphTabQueryMemory(file.id)
      forgetGitGraphRevealRequest(file.id)
    }
  }
}
