// Fork-only: frees a closed Git Graph tab's in-memory state; a reopen restores from the tab's saved filter
// and starts on the checked-out commit.
import { forgetGitGraphTabFilters } from '../right-sidebar/source-control/sync/git-history-graph-filter'
import { forgetGitGraphTabQueryMemory } from '../right-sidebar/source-control/sync/git-history-graph-query-tokens'
import { forgetGitGraphRememberedSelection } from '../right-sidebar/source-control/sync/git-graph-remembered-selection'
import { forgetGitGraphRevealRequest } from './git-graph-reveal-request'

export function forgetClosedGitGraphTabs(files: readonly { id: string; mode?: string }[]): void {
  for (const file of files) {
    if (file.mode === 'git-graph') {
      forgetGitGraphTabFilters(file.id)
      forgetGitGraphTabQueryMemory(file.id)
      forgetGitGraphRevealRequest(file.id)
      forgetGitGraphRememberedSelection(file.id)
    }
  }
}
