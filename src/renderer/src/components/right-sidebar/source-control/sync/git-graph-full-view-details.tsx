// Fork-only: the full Git Graph's right pane, IntelliJ-style: changed files on top, commit details below.
import React, { useCallback, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { translate } from '@/i18n/i18n'
import { useWindowWidth } from '../../use-window-width'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import { dedupeRemoteTrackingRefs } from '../../../../../../shared/git-history-ref-display'
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import type { GitHistoryPanelSlots } from './git-history-panel-slots'
import { GitHistoryCommitFiles, type GitHistoryCommitFilesState } from './git-history-commit-files'
import { formatGitHistoryTimestamp } from './git-history-format'
import { formatGitGraphShortDate, GitGraphRefBadge } from './git-graph-full-row'

const DETAILS_WIDTH_KEY = 'orca:git-graph-details-width'
const DETAILS_MIN_WIDTH = 280
const DETAILS_DEFAULT_WIDTH = 480

function readDetailsWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(DETAILS_WIDTH_KEY))
    return stored >= DETAILS_MIN_WIDTH ? stored : DETAILS_DEFAULT_WIDTH
  } catch {
    return DETAILS_DEFAULT_WIDTH
  }
}

function writeDetailsWidth(width: number): void {
  try {
    window.localStorage.setItem(DETAILS_WIDTH_KEY, String(width))
  } catch {}
}

export type MergedCommitFiles = {
  state: GitHistoryCommitFilesState
  /** Commit whose change a merged row shows: the newest selected commit touching that path. */
  ownerByPath: ReadonlyMap<string, GitHistoryItem>
}

/** Union of the commits' files, newest first (graph order); the newest change of a path wins. */
export function mergeCommitFiles(
  items: readonly GitHistoryItem[],
  filesByCommit: Readonly<Record<string, GitHistoryCommitFilesState>>
): MergedCommitFiles {
  const ownerByPath = new Map<string, GitHistoryItem>()
  const entries: GitBranchChangeEntry[] = []
  let loading = false
  for (const item of items) {
    const files = filesByCommit[item.id]
    if (files?.status === 'error') {
      return { state: files, ownerByPath }
    }
    if (files?.status !== 'ready') {
      loading = true
      continue
    }
    for (const entry of files.entries) {
      if (!ownerByPath.has(entry.path)) {
        ownerByPath.set(entry.path, item)
        entries.push(entry)
      }
    }
  }
  return { state: loading ? { status: 'loading' } : { status: 'ready', entries }, ownerByPath }
}

function CommitInfo({ item }: { item: GitHistoryItem }): React.JSX.Element {
  const refs = dedupeRemoteTrackingRefs(item.references ?? [])
  const body = item.message.startsWith(item.subject)
    ? item.message.slice(item.subject.length).trim()
    : item.message.trim()
  const author = item.authorEmail ? `${item.author ?? ''} <${item.authorEmail}>` : item.author
  return (
    <div className="flex flex-col gap-1 px-3 py-2">
      <p className="text-sm font-medium break-words text-foreground select-text">{item.subject}</p>
      {body && (
        <p className="text-xs break-words whitespace-pre-wrap text-foreground select-text">
          {body}
        </p>
      )}
      <p className="font-mono text-2xs break-all text-muted-foreground select-text">{item.id}</p>
      <p className="text-2xs text-muted-foreground select-text">
        {[author, formatGitHistoryTimestamp(item.timestamp)].filter(Boolean).join(' · ')}
      </p>
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {refs.map((ref) => (
            <GitGraphRefBadge key={ref.id} itemRef={ref} />
          ))}
        </div>
      )}
    </div>
  )
}

function CommitsSummary({ items }: { items: readonly GitHistoryItem[] }): React.JSX.Element {
  return (
    <ul className="flex flex-col py-1">
      {items.map((item) => (
        <li key={item.id} className="flex min-w-0 items-baseline gap-2 px-3 py-0.5 text-xs">
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">
            {item.displayId}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground" title={item.subject}>
            {item.subject}
          </span>
          <span className="shrink-0 text-2xs text-muted-foreground">
            {item.author} · {formatGitGraphShortDate(item.timestamp)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function GitGraphDetailsPane({
  items,
  filesByCommit,
  onOpenCommit,
  onOpenCommitFile,
  onCopyFullSource,
  renderCommitFilesMenu
}: {
  /** Newest first; empty when nothing is selected. */
  items: readonly GitHistoryItem[]
  filesByCommit: Readonly<Record<string, GitHistoryCommitFilesState>>
  onOpenCommit: (item: GitHistoryItem) => void
  onOpenCommitFile: (
    item: GitHistoryItem,
    entry: GitBranchChangeEntry,
    event?: SourceControlRowOpenEvent
  ) => void
  onCopyFullSource?: (items: readonly GitHistoryItem[]) => void
  renderCommitFilesMenu?: GitHistoryPanelSlots['renderCommitFilesMenu']
}): React.JSX.Element {
  const [width, setWidth] = useState(readDetailsWidth)
  // Why viewport-relative: the dialog spans the window, so this keeps the commit list usable.
  const windowWidth = useWindowWidth() ?? 0
  const maxWidth = Math.max(DETAILS_MIN_WIDTH, Math.round(windowWidth * 0.6))
  const shownWidth = Math.min(width, maxWidth)
  const saveWidth = useCallback((next: number): void => {
    setWidth(next)
    writeDetailsWidth(next)
  }, [])
  const { containerRef, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width: shownWidth,
    minWidth: DETAILS_MIN_WIDTH,
    maxWidth,
    deltaSign: -1,
    setWidth: saveWidth
  })
  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0
    if (delta !== 0) {
      event.preventDefault()
      saveWidth(Math.min(maxWidth, Math.max(DETAILS_MIN_WIDTH, shownWidth + delta)))
    }
  }

  const merged = useMemo(() => mergeCommitFiles(items, filesByCommit), [items, filesByCommit])
  const first = items[0]
  const fileCount = merged.state.status === 'ready' ? merged.state.entries.length : null
  const copyLabel = translate(
    'auto.components.right.sidebar.GitGraphFullView.copyFullSource',
    'Copy Full Source of all changed files'
  )

  return (
    // Why: useSidebarResize owns the inline width so a rerender mid-drag can't snap it back.
    <div
      ref={containerRef}
      className="relative flex min-h-0 shrink-0 flex-col border-l border-border"
    >
      <div
        role="separator"
        aria-label={translate(
          'auto.components.right.sidebar.GitGraphFullView.resizeDetails',
          'Resize commit details'
        )}
        aria-orientation="vertical"
        aria-valuemin={DETAILS_MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={shownWidth}
        tabIndex={0}
        className="group absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize outline-none"
        onMouseDown={onResizeStart}
        onKeyDown={handleResizeKeyDown}
      >
        <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover:bg-ring/50 group-active:bg-ring group-focus-visible:bg-ring" />
      </div>
      {first === undefined ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.GitGraphFullView.selectCommit',
            'Select a commit to see its details and changed files.'
          )}
        </p>
      ) : (
        <>
          <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-3">
            <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
              {items.length > 1
                ? translate(
                    'auto.components.right.sidebar.GitGraphFullView.filesInCommits',
                    'Changed files ({{files}}) · {{commits}} commits',
                    { files: fileCount ?? '…', commits: items.length }
                  )
                : translate(
                    'auto.components.right.sidebar.GitGraphFullView.filesChanged',
                    'Changed files ({{files}})',
                    { files: fileCount ?? '…' }
                  )}
            </span>
            {onCopyFullSource && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={copyLabel}
                    disabled={fileCount === null || fileCount === 0}
                    onClick={() => onCopyFullSource(items)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  {copyLabel}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {/* Why the override: the shared list indents for the sidebar tree; align it with the header. */}
          <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto py-1 [&_.pl-9]:pl-3">
            <GitHistoryCommitFiles
              className="border-l-0 bg-transparent"
              state={merged.state}
              onOpenFile={(entry, event) =>
                onOpenCommitFile(merged.ownerByPath.get(entry.path) ?? first, entry, event)
              }
              onOpenAll={items.length === 1 ? () => onOpenCommit(first) : undefined}
              renderFilesMenu={renderCommitFilesMenu?.bind(null, items)}
            />
          </div>
          <div className="scrollbar-sleek max-h-[45%] shrink-0 overflow-y-auto border-t border-border">
            {items.length > 1 ? <CommitsSummary items={items} /> : <CommitInfo item={first} />}
          </div>
        </>
      )}
    </div>
  )
}
