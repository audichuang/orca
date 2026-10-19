// Fork-only: Copy Path / Copy Full Source for files of an expanded commit (ClipCode's Vcs.Log.ChangesBrowser.Popup).
import { useState } from 'react'
import type React from 'react'
import { joinPath } from '@/lib/path'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import { SourceControlEntryContextMenu } from '../listing/entry-context-menu'
import {
  SOURCE_CONTROL_OPEN_TO_SIDE_EVENT,
  type SourceControlRowOpenEvent
} from '../listing/split-open'
import type { SourceControlPanelModel } from '../panel/use-panel-model'
import { copyHistoryCommitsFullSource } from './git-history-commit-copy'
import type { GitHistoryPanelSlots } from './git-history-panel-slots'

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
    'activeConnectionId' | 'activeRepoTarget' | 'editorWorktreeId' | 'revealInExplorer'
  >
  worktreeId: string
  worktreePath: string
  item: GitHistoryItem
  entries: readonly GitBranchChangeEntry[]
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  children: React.JSX.Element
}): React.JSX.Element {
  const [entry, setEntry] = useState<GitBranchChangeEntry | null>(null)
  const handleContextMenuCapture = (event: React.MouseEvent): void => {
    const row =
      event.target instanceof Element ? event.target.closest('[data-commit-file-path]') : null
    const target = entries.find((e) => e.path === row?.getAttribute('data-commit-file-path'))
    if (!target) {
      // Why: Radix skips opening on a prevented event, so loading/error/"Open all" get no menu.
      event.preventDefault()
    }
    setEntry(target ?? null)
  }
  const copyFullSource = (target: GitBranchChangeEntry): void =>
    void copyHistoryCommitsFullSource({
      items: [item],
      worktreeId,
      worktreePath,
      editorWorktreeId: model.editorWorktreeId ?? null,
      activeRepoTarget: model.activeRepoTarget,
      // Why a one-entry loader: the commit's Copy Full Source, narrowed to the right-clicked file.
      loadCommitFiles: async () => [target]
    })
  return (
    <SourceControlEntryContextMenu
      currentWorktreeId={worktreeId}
      absolutePath={entry ? joinPath(worktreePath, entry.path) : undefined}
      relativePath={entry?.path}
      hasWorkingTreeFile={entry !== null && entry.status !== 'deleted'}
      connectionId={model.activeConnectionId}
      onView={entry ? () => onOpenFile(entry, PLAIN_OPEN_EVENT) : undefined}
      onOpenToSide={entry ? () => onOpenFile(entry, SOURCE_CONTROL_OPEN_TO_SIDE_EVENT) : undefined}
      onCopyFullSource={entry ? () => copyFullSource(entry) : undefined}
      // Why: in a folder workspace the explorer belongs to the folder, not this child repo.
      onRevealInExplorer={(_repoId, path) =>
        model.revealInExplorer(model.editorWorktreeId ?? worktreeId, path)
      }
    >
      <div onContextMenuCapture={handleContextMenuCapture}>{children}</div>
    </SourceControlEntryContextMenu>
  )
}

/** The `renderCommitFilesMenu` slot for one repo's Commits panel and its full view. */
export function commitFilesMenuSlot(
  model: React.ComponentProps<typeof GitHistoryCommitFilesMenu>['model'],
  worktreeId: string,
  worktreePath: string
): NonNullable<GitHistoryPanelSlots['renderCommitFilesMenu']> {
  return (item, entries, onOpenFile, list) => (
    <GitHistoryCommitFilesMenu {...{ model, worktreeId, worktreePath, item, entries, onOpenFile }}>
      {list}
    </GitHistoryCommitFilesMenu>
  )
}
