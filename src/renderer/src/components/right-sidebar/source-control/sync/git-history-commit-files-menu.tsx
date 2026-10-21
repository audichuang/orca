// Fork-only: Copy Path / Copy Full Source for files of an expanded commit (ClipCode's Vcs.Log.ChangesBrowser.Popup).
import { useState } from 'react'
import type React from 'react'
import { joinPath } from '@/lib/path'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
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
import {
  applyCommitFileClick,
  applyCommitFileContextMenu,
  EMPTY_COMMIT_FILE_SELECTION
} from './git-history-commit-file-selection'

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
  items,
  loadCommitFiles,
  entries,
  onOpenFile,
  renderList
}: {
  model: Pick<
    SourceControlPanelModel,
    'activeConnectionId' | 'activeRepoTarget' | 'editorWorktreeId' | 'revealInExplorer'
  >
  worktreeId: string
  worktreePath: string
  /** Newest first; several when the full graph merges a multi-commit selection. */
  items: readonly GitHistoryItem[]
  loadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  entries: readonly GitBranchChangeEntry[]
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  renderList: (selectedPaths: ReadonlySet<string>) => React.JSX.Element
}): React.JSX.Element {
  const [entry, setEntry] = useState<GitBranchChangeEntry | null>(null)
  const [dirPath, setDirPath] = useState<string | null>(null)
  const [selection, setSelection] = useState(EMPTY_COMMIT_FILE_SELECTION)
  const entryAt = (event: React.MouseEvent): GitBranchChangeEntry | undefined => {
    const row =
      event.target instanceof Element ? event.target.closest('[data-commit-file-path]') : null
    return entries.find((e) => e.path === row?.getAttribute('data-commit-file-path'))
  }
  const handleClickCapture = (event: React.MouseEvent): void => {
    const target = entryAt(event)
    if (!target) {
      return
    }
    const next = applyCommitFileClick(
      selection,
      entries.map((e) => e.path),
      target.path,
      event,
      getShortcutPlatform() === 'darwin'
    )
    setSelection(next.state)
    if (next.handled) {
      // Why: a modifier click only edits the selection; the row's own onClick would open the diff.
      event.preventDefault()
      event.stopPropagation()
    }
  }
  const handleContextMenuCapture = (event: React.MouseEvent): void => {
    const target = entryAt(event)
    const dir =
      event.target instanceof Element
        ? event.target.closest('[data-commit-dir-path]')?.getAttribute('data-commit-dir-path')
        : null
    setDirPath(target ? null : (dir ?? null))
    if (dir && !target) {
      setEntry(null)
      return
    }
    if (!target) {
      // Why: Radix skips opening on a prevented event, so loading/error/"Open all" get no menu.
      event.preventDefault()
    } else {
      setSelection((prev) => applyCommitFileContextMenu(prev, target.path))
    }
    setEntry(target ?? null)
  }
  // Why: the right-clicked row acts on the whole selection when it is part of it.
  const copyTargets = (target: GitBranchChangeEntry): GitBranchChangeEntry[] =>
    selection.selected.has(target.path)
      ? entries.filter((e) => selection.selected.has(e.path))
      : [target]
  const copyFullSource = (targets: readonly GitBranchChangeEntry[]): void => {
    const paths = new Set(targets.map((e) => e.path))
    void copyHistoryCommitsFullSource({
      items,
      worktreeId,
      worktreePath,
      editorWorktreeId: model.editorWorktreeId ?? null,
      activeRepoTarget: model.activeRepoTarget,
      // Why a narrowed loader: the commits' Copy Full Source, limited to the selected files.
      loadCommitFiles: async (item) =>
        (await loadCommitFiles(item)).filter((entry) => paths.has(entry.path))
    })
  }
  const dirEntries = dirPath === null ? [] : entries.filter((e) => e.path.startsWith(`${dirPath}/`))
  const targetPath = entry?.path ?? dirPath ?? undefined
  return (
    <SourceControlEntryContextMenu
      currentWorktreeId={worktreeId}
      absolutePath={targetPath === undefined ? undefined : joinPath(worktreePath, targetPath)}
      relativePath={targetPath}
      hasWorkingTreeFile={
        entry ? entry.status !== 'deleted' : dirEntries.some((e) => e.status !== 'deleted')
      }
      connectionId={model.activeConnectionId}
      onView={entry ? () => onOpenFile(entry, PLAIN_OPEN_EVENT) : undefined}
      onOpenToSide={entry ? () => onOpenFile(entry, SOURCE_CONTROL_OPEN_TO_SIDE_EVENT) : undefined}
      onCopyFullSource={
        entry
          ? () => copyFullSource(copyTargets(entry))
          : dirEntries.length > 0
            ? () => copyFullSource(dirEntries)
            : undefined
      }
      // Why: in a folder workspace the explorer belongs to the folder, not this child repo.
      onRevealInExplorer={(_repoId, path) =>
        model.revealInExplorer(model.editorWorktreeId ?? worktreeId, path)
      }
    >
      <div onClickCapture={handleClickCapture} onContextMenuCapture={handleContextMenuCapture}>
        {renderList(selection.selected)}
      </div>
    </SourceControlEntryContextMenu>
  )
}

/** The `renderCommitFilesMenu` slot for one repo's Commits panel and its full view. */
export function commitFilesMenuSlot(
  model: React.ComponentProps<typeof GitHistoryCommitFilesMenu>['model'],
  worktreeId: string,
  worktreePath: string,
  loadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
): NonNullable<GitHistoryPanelSlots['renderCommitFilesMenu']> {
  return (items, entries, onOpenFile, renderList) => (
    <GitHistoryCommitFilesMenu
      // Why: the full graph reuses one details pane; a new repo or commit must not inherit the old selection.
      key={`${worktreeId}:${items.map((item) => item.id).join(',')}`}
      {...{
        model,
        worktreeId,
        worktreePath,
        items,
        loadCommitFiles,
        entries,
        onOpenFile,
        renderList
      }}
    />
  )
}
