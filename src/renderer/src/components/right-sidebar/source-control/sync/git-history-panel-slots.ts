// Fork-only: content the fork plugs into upstream's Commits panel.
import type React from 'react'

export type GitHistoryPanelSlots = {
  /** Branch filter / search row under the header. */
  toolbar?: React.ReactNode
  /** Rendered after the last commit (load more). */
  footer?: React.ReactNode
  /** Replaces "No commits yet", e.g. when a filter matched nothing. */
  emptyMessage?: React.ReactNode
}
