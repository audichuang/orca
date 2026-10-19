// Fork-only: content the fork plugs into upstream's Commits panel.
import type React from 'react'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { SourceControlRowOpenEvent } from '../listing/split-open'

/** Wraps an expanded commit's file list; `onOpenFile` is the list's own open (a dialog host closes first). */
export type GitHistoryCommitFilesMenuRenderer = (
  entries: readonly GitBranchChangeEntry[],
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void,
  list: React.JSX.Element
) => React.ReactNode

export type GitHistoryPanelSlots = {
  /** Branch filter / search row under the header. */
  toolbar?: React.ReactNode
  /** Rendered after the last commit (load more). */
  footer?: React.ReactNode
  /** Replaces "No commits yet", e.g. when a filter matched nothing. */
  emptyMessage?: React.ReactNode
  /** Context menu over an expanded commit's file rows. */
  renderCommitFilesMenu?: (
    item: GitHistoryItem,
    ...args: Parameters<GitHistoryCommitFilesMenuRenderer>
  ) => React.ReactNode
}
