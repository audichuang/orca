import { createElement, useMemo, useState } from 'react'
import type React from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { STATUS_COLORS, STATUS_LABELS } from '../../status-display'
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
import {
  buildSourceControlTree,
  compactSourceControlTree,
  flattenSourceControlTree
} from '../../source-control-tree'
import type { BranchSourceControlTreeNode } from '../listing/directory-action-paths'
import { SourceControlBranchTreeDirectoryRow } from '../listing/tree-directory-rows'
import {
  SOURCE_CONTROL_TREE_FILE_PADDING_PX,
  SOURCE_CONTROL_TREE_INDENT_PX
} from '../listing/row-layout'
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
  depth,
  onOpen
}: {
  entry: GitBranchChangeEntry
  selected: boolean
  /** Tree depth; the folder rows above carry the path, so the hint is dropped. */
  depth?: number
  onOpen: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const status = entry.status as GitFileStatus
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = depth !== undefined || parentDir === '.' ? '' : parentDir

  return (
    <button
      type="button"
      className={cn(
        'group flex w-full min-w-0 cursor-pointer items-center gap-1 py-1 pr-3 text-left text-xs transition-colors',
        depth === undefined && 'pl-9',
        // Why: the selected look (main.css) must not be washed out by the plain hover tint.
        !selected && 'hover:bg-accent/40'
      )}
      style={
        depth === undefined
          ? undefined
          : {
              paddingLeft: `${depth * SOURCE_CONTROL_TREE_INDENT_PX + SOURCE_CONTROL_TREE_FILE_PADDING_PX}px`
            }
      }
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

function CommitFilesTree({
  roots,
  selectedPaths,
  onOpenFile
}: {
  roots: readonly BranchSourceControlTreeNode[]
  selectedPaths: ReadonlySet<string>
  onOpenFile: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(NO_SELECTION)
  const toggle = (key: string): void =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  return (
    <>
      {flattenSourceControlTree(roots, collapsed).map((node) =>
        node.type === 'directory' ? (
          // Why the wrapper: the files menu finds a right-clicked folder by this attribute.
          <div key={node.key} data-commit-dir-path={node.path}>
            <SourceControlBranchTreeDirectoryRow
              node={node}
              isCollapsed={collapsed.has(node.key)}
              onToggle={() => toggle(node.key)}
            />
          </div>
        ) : (
          <CommitFileRow
            key={node.key}
            entry={node.entry}
            depth={node.depth}
            selected={selectedPaths.has(node.entry.path)}
            onOpen={onOpenFile}
          />
        )
      )}
    </>
  )
}

function CommitFilesBody({
  state,
  treeRoots,
  selectedPaths = NO_SELECTION,
  onOpenFile,
  onOpenAll
}: {
  state: GitHistoryCommitFilesState
  /** Set in tree layout once the files are ready. */
  treeRoots?: readonly BranchSourceControlTreeNode[]
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
      {treeRoots ? (
        <CommitFilesTree roots={treeRoots} selectedPaths={selectedPaths} onOpenFile={onOpenFile} />
      ) : (
        state.entries.map((entry) => (
          <CommitFileRow
            key={entry.path}
            entry={entry}
            selected={selectedPaths.has(entry.path)}
            onOpen={onOpenFile}
          />
        ))
      )}
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
  const treeRoots = useMemo(
    () =>
      layout === 'tree' && state.status === 'ready'
        ? compactSourceControlTree(buildSourceControlTree('branch', state.entries))
        : undefined,
    [layout, state]
  )
  // Why tree order: shift-click ranges must follow the rows as shown, not git's path order.
  const menuEntries = useMemo(() => {
    if (treeRoots) {
      return flattenSourceControlTree(treeRoots, NO_SELECTION).flatMap((node) =>
        node.type === 'file' ? [node.entry] : []
      )
    }
    return state.status === 'ready' ? state.entries : []
  }, [treeRoots, state])
  const openFile = (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent): void =>
    onOpenFile(entry, event, { entries: menuEntries })
  // Author and date move off the dense commit row and surface here on expand.
  const body = (
    <CommitFilesBody
      state={state}
      treeRoots={treeRoots}
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
            <div>
              <CommitFilesBody
                state={state}
                treeRoots={treeRoots}
                selectedPaths={selectedPaths}
                onOpenFile={openFile}
                onOpenAll={onOpenAll}
              />
            </div>
          ))
        : body}
    </div>
  )
}
