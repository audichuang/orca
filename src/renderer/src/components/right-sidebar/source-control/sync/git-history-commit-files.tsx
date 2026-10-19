import { createElement } from 'react'
import type React from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { STATUS_COLORS, STATUS_LABELS } from '../../status-display'
import {
  toPermanentSourceControlRowOpenEvent,
  toSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from '../listing/split-open'
import { getFileTypeIcon } from '@/lib/file-type-icons'
import { basename, dirname } from '@/lib/path'
import { translate } from '@/i18n/i18n'
import { formatGitHistoryTimestamp } from './git-history-format'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import type { GitFileStatus } from '../../../../../../shared/git-status-types'
import type { GitHistoryCommitFilesMenuRenderer } from './git-history-panel-slots'

// State for a single commit's lazily-loaded file list. Owned by GitHistoryPanel,
// populated through the onLoadCommitFiles loader supplied by SourceControl.
export type GitHistoryCommitFilesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: GitBranchChangeEntry[] }

function CommitFileRow({
  entry,
  selected,
  onOpen
}: {
  entry: GitBranchChangeEntry
  selected: boolean
  onOpen: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const status = entry.status as GitFileStatus
  const FileIcon = getFileTypeIcon(entry.path)
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' ? '' : parentDir

  return (
    <button
      type="button"
      className="group flex w-full min-w-0 cursor-pointer items-center gap-1 py-1 pl-9 pr-3 text-left text-xs transition-colors hover:bg-accent/40 data-[selected]:bg-accent/60"
      title={entry.path}
      data-testid="git-history-commit-file"
      data-commit-file-path={entry.path}
      data-selected={selected || undefined}
      onClick={(event) => onOpen(entry, toSourceControlRowOpenEvent(event))}
      onDoubleClick={(event) => onOpen(entry, toPermanentSourceControlRowOpenEvent(event))}
    >
      {createElement(FileIcon, {
        className: 'size-3.5 shrink-0',
        style: { color: STATUS_COLORS[status] }
      })}
      <span className="min-w-0 flex-1 truncate">
        <span className="text-foreground">{fileName}</span>
        {dirPath && <span className="ml-1.5 text-[11px] text-muted-foreground">{dirPath}</span>}
      </span>
      <span
        className="w-4 shrink-0 text-center text-[10px] font-bold"
        style={{ color: STATUS_COLORS[status] }}
      >
        {STATUS_LABELS[status]}
      </span>
    </button>
  )
}

const NO_SELECTION: ReadonlySet<string> = new Set()

function CommitFilesBody({
  state,
  selectedPaths = NO_SELECTION,
  onOpenFile,
  onOpenAll
}: {
  state: GitHistoryCommitFilesState
  selectedPaths?: ReadonlySet<string>
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  onOpenAll?: () => void
}): React.JSX.Element {
  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-1 pl-9 pr-3 text-[11px] text-muted-foreground">
        <RefreshCw className="size-3 animate-spin" />
        <span>
          {translate(
            'auto.components.right.sidebar.GitHistoryCommitFiles.a1b2c3d4e5',
            'Loading files…'
          )}
        </span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="py-1 pl-9 pr-3 text-[11px] text-destructive" title={state.error}>
        {state.error}
      </div>
    )
  }

  if (state.entries.length === 0) {
    return (
      <div className="py-1 pl-9 pr-3 text-[11px] text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.GitHistoryCommitFiles.b2c3d4e5f6',
          'No file changes in this commit'
        )}
      </div>
    )
  }

  return (
    <>
      {state.entries.map((entry) => (
        <CommitFileRow
          key={entry.path}
          entry={entry}
          selected={selectedPaths.has(entry.path)}
          onOpen={onOpenFile}
        />
      ))}
      {onOpenAll && (
        <button
          type="button"
          className="flex w-full items-center gap-1 py-1 pl-9 pr-3 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          onClick={onOpenAll}
        >
          <ArrowUpRight className="size-3 shrink-0" />
          <span>
            {translate(
              'auto.components.right.sidebar.GitHistoryCommitFiles.c3d4e5f6a7',
              'Open all changes together'
            )}
          </span>
        </button>
      )}
    </>
  )
}

export function GitHistoryCommitFiles({
  state,
  author,
  timestamp,
  onOpenFile,
  onOpenAll,
  renderFilesMenu
}: {
  state: GitHistoryCommitFilesState
  author?: string
  timestamp?: number
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
  onOpenAll?: () => void
  renderFilesMenu?: GitHistoryCommitFilesMenuRenderer
}): React.JSX.Element {
  // Author and date move off the dense commit row and surface here on expand.
  const body = <CommitFilesBody state={state} onOpenFile={onOpenFile} onOpenAll={onOpenAll} />
  const meta = [author, formatGitHistoryTimestamp(timestamp)].filter(Boolean).join(' · ')
  return (
    <div className="border-l border-border/60 bg-muted/20">
      {meta && <div className="py-1 pl-9 pr-3 text-[11px] text-muted-foreground">{meta}</div>}
      {renderFilesMenu
        ? renderFilesMenu(
            state.status === 'ready' ? state.entries : [],
            onOpenFile,
            (selectedPaths) => (
              <div>
                <CommitFilesBody
                  state={state}
                  selectedPaths={selectedPaths}
                  onOpenFile={onOpenFile}
                  onOpenAll={onOpenAll}
                />
              </div>
            )
          )
        : body}
    </div>
  )
}
