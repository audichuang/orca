import { createElement } from 'react'
import type React from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { STATUS_COLORS } from '../../../../lib/git-path-decoration'
import { STATUS_LABELS } from '../../../../../../shared/git/status/git-status-labels'
import {
  toPermanentSourceControlRowOpenEvent,
  toSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from '../listing/split-open'
import { FileTypeIcon } from '@/components/FileTypeIcon'
import { basename, dirname } from '@/lib/path'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { formatGitHistoryTimestamp } from './git-history-format'
import type { GitBranchChangeEntry } from '../../../../../../shared/git/diff/git-diff-compare-types'
import type { GitFileStatus } from '../../../../../../shared/git/status/git-status-types'
import type { GitHistoryCommitFilesMenuRenderer } from './git-history-panel-slots'
import { useCommitFilesTreeLayout, type CommitFilesTreeRows } from './git-history-commit-files-tree'

export type GitHistoryCommitFilesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: GitBranchChangeEntry[] }

function CommitFileRow({
  entry,
  selected,
  indentPx,
  onOpen
}: {
  entry: GitBranchChangeEntry
  selected: boolean
  /** Tree indent; the folder rows above carry the path, so the hint is dropped. */
  indentPx?: number
  onOpen: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const status = entry.status as GitFileStatus
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = indentPx !== undefined || parentDir === '.' ? '' : parentDir

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full min-w-0 cursor-pointer items-center gap-1 py-1 pr-3 text-left text-xs transition-colors',
        indentPx === undefined && 'pl-9',
        // Why: the selected look (main.css) must not be washed out by the plain hover tint.
        !selected && 'hover:bg-accent/40'
      )}
      style={indentPx === undefined ? undefined : { paddingLeft: `${indentPx}px` }}
      title={entry.path}
      data-testid="git-history-commit-file"
      data-commit-file-path={entry.path}
      data-selected={selected ? 'true' : undefined}
      aria-pressed={selected || undefined}
      onClick={(event) => onOpen(entry, toSourceControlRowOpenEvent(event))}
      onDoubleClick={(event) => onOpen(entry, toPermanentSourceControlRowOpenEvent(event))}
    >
      {createElement(FileTypeIcon, {
        filePath: entry.path,
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
  renderRows,
  selectedPaths = NO_SELECTION,
  onOpenFile,
  onOpenAll
}: {
  state: GitHistoryCommitFilesState
  /** Set in tree layout once the files are ready. */
  renderRows?: CommitFilesTreeRows
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
      {renderRows
        ? renderRows((entry, indentPx) => (
            <CommitFileRow
              key={entry.path}
              entry={entry}
              indentPx={indentPx}
              selected={selectedPaths.has(entry.path)}
              onOpen={onOpenFile}
            />
          ))
        : state.entries.map((entry) => (
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
  renderFilesMenu,
  layout = 'list',
  className
}: {
  state: GitHistoryCommitFilesState
  layout?: 'list' | 'tree'
  author?: string
  timestamp?: number
  /** `shown.entries` is the list in display order, so a diff can step to its neighbours. */
  onOpenFile: (
    entry: GitBranchChangeEntry,
    event: SourceControlRowOpenEvent,
    shown: { entries: readonly GitBranchChangeEntry[] }
  ) => void
  onOpenAll?: () => void
  renderFilesMenu?: GitHistoryCommitFilesMenuRenderer
  className?: string
}): React.JSX.Element {
  const { entries: menuEntries, renderRows } = useCommitFilesTreeLayout(layout, state)
  const openFile = (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent): void =>
    onOpenFile(entry, event, { entries: menuEntries })
  const renderBody = (selectedPaths?: ReadonlySet<string>): React.JSX.Element => (
    <CommitFilesBody
      state={state}
      renderRows={renderRows}
      selectedPaths={selectedPaths}
      onOpenFile={openFile}
      onOpenAll={onOpenAll}
    />
  )
  const meta = [author, formatGitHistoryTimestamp(timestamp)].filter(Boolean).join(' · ')
  return (
    <div className={cn('border-l border-border/60 bg-muted/20', className)}>
      {meta && <div className="py-1 pl-9 pr-3 text-[11px] text-muted-foreground">{meta}</div>}
      {renderFilesMenu
        ? renderFilesMenu(menuEntries, openFile, (selectedPaths) => (
            <div>{renderBody(selectedPaths)}</div>
          ))
        : renderBody()}
    </div>
  )
}
