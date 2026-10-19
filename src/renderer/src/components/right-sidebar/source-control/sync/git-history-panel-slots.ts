// Fork-only: content the fork plugs into upstream's Commits panel.
import type React from 'react'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitHistoryCommitFilesMenuRenderer } from './git-history-commit-files'

export type GitHistoryPanelSlots = {
  /** Branch filter / search row under the header. */
  toolbar?: React.ReactNode
  /** Rendered after the last commit (load more). */
  footer?: React.ReactNode
  /** Replaces "No commits yet", e.g. when a filter matched nothing. */
  emptyMessage?: React.ReactNode
  /** Wraps an expanded commit's file rows (context menu). */
  renderCommitFilesMenu?: (
    item: GitHistoryItem,
    ...args: Parameters<GitHistoryCommitFilesMenuRenderer>
  ) => React.ReactNode
}
