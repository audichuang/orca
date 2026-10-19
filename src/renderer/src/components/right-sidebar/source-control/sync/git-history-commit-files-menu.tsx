// Fork-only: Copy Path / Copy Full Source for files of an expanded commit (ClipCode's Vcs.Log.ChangesBrowser.Popup).
import { useState } from 'react'
import type React from 'react'
import { joinPath } from '@/lib/path'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import { SourceControlEntryContextMenu } from '../listing/entry-context-menu'
import { SOURCE_CONTROL_OPEN_TO_SIDE_EVENT } from '../listing/split-open'
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import type { SourceControlPanelModel } from '../panel/use-panel-model'

const PLAIN_OPEN_EVENT: SourceControlRowOpenEvent = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
}

// Why one menu per commit, not per row: each menu subscribes to the store and this list is not virtualized.
export function GitHistoryCommitFilesMenu({
  model,
  worktreeId,
  worktreePath,
  item,
  entries,
  onOpenFile,
  children
}: {
  model: Pick<
    SourceControlPanelModel,
    'activeConnectionId' | 'copyCommitFileFullSource' | 'revealInExplorer'
  >
  worktreeId: string
  worktreePath: string
  item: GitHistoryItem
  entries: readonly GitBranchChangeEntry[]
  /** The list's own open, so a host (the full-view dialog) can close itself first. */
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  children: React.JSX.Element
}): React.JSX.Element {
  const [entry, setEntry] = useState<GitBranchChangeEntry | null>(null)
  const handleContextMenuCapture = (event: React.MouseEvent): void => {
    const row =
      event.target instanceof Element ? event.target.closest('[data-commit-file-path]') : null
    const path = row?.getAttribute('data-commit-file-path')
    setEntry(entries.find((candidate) => candidate.path === path) ?? null)
  }
  return (
    <SourceControlEntryContextMenu
      currentWorktreeId={worktreeId}
      absolutePath={entry ? joinPath(worktreePath, entry.path) : undefined}
      relativePath={entry?.path}
      hasWorkingTreeFile={entry !== null && entry.status !== 'deleted'}
      connectionId={model.activeConnectionId}
      onView={entry ? () => onOpenFile(entry, PLAIN_OPEN_EVENT) : undefined}
      onOpenToSide={entry ? () => onOpenFile(entry, SOURCE_CONTROL_OPEN_TO_SIDE_EVENT) : undefined}
      onCopyFullSource={entry ? () => model.copyCommitFileFullSource(item, entry) : undefined}
      onRevealInExplorer={model.revealInExplorer}
    >
      <div onContextMenuCapture={handleContextMenuCapture}>{children}</div>
    </SourceControlEntryContextMenu>
  )
}
