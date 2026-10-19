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
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import type { GitHistoryPanelSlots } from './git-history-panel-slots'
import { GitHistoryCommitFiles, type GitHistoryCommitFilesState } from './git-history-commit-files'
import {
  GitGraphCommitInfo,
  GitGraphCommitsSummary,
  type GitGraphCommitContext
} from './git-graph-commit-info'

const DETAILS_WIDTH_KEY = 'orca:git-graph-details-width'
const DETAILS_MIN_WIDTH = 280
const DETAILS_DEFAULT_WIDTH = 480
// Dialog inset and padding, plus the narrowest commit list that still shows message and date.
const DETAILS_RESERVED_CHROME = 112
const COMMIT_LIST_MIN_WIDTH = 460

// Why viewport-relative: a flat default left one-file commits in a half-empty pane on laptops.
function defaultDetailsWidth(): number {
  return Math.max(
    DETAILS_MIN_WIDTH,
    Math.min(DETAILS_DEFAULT_WIDTH, Math.round(window.innerWidth * 0.3))
  )
}

function readDetailsWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(DETAILS_WIDTH_KEY))
    return stored >= DETAILS_MIN_WIDTH ? stored : defaultDetailsWidth()
  } catch {
    return defaultDetailsWidth()
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

export function GitGraphDetailsPane({
  items,
  filesByCommit,
  onOpenCommit,
  onOpenCommitFile,
  onCopyFullSource,
  renderCommitFilesMenu,
  commitContext,
  reservedWidth
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
  commitContext: GitGraphCommitContext
  /** Width other side panes (the branch tree) take from the window. */
  reservedWidth: number
}): React.JSX.Element {
  const [width, setWidth] = useState(readDetailsWidth)
  // Why: the cap leaves the commit list its minimum, and follows window resizes (the dialog spans it).
  const windowWidth = useWindowWidth() ?? 0
  // Why a smaller floor on tiny windows: a fixed 280px left near-identical subjects unreadable.
  const minWidth = Math.min(
    DETAILS_MIN_WIDTH,
    Math.max(200, Math.round((windowWidth - DETAILS_RESERVED_CHROME) * 0.42))
  )
  const maxWidth = Math.max(
    minWidth,
    Math.min(
      Math.round(windowWidth * 0.55),
      windowWidth - DETAILS_RESERVED_CHROME - COMMIT_LIST_MIN_WIDTH - reservedWidth
    )
  )
  const shownWidth = Math.max(minWidth, Math.min(width, maxWidth))
  const saveWidth = useCallback((next: number): void => {
    setWidth(next)
    writeDetailsWidth(next)
  }, [])
  const { containerRef, onResizeStart } = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width: shownWidth,
    minWidth,
    maxWidth,
    deltaSign: -1,
    setWidth: saveWidth
  })
  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0
    if (delta !== 0) {
      event.preventDefault()
      saveWidth(Math.min(maxWidth, Math.max(minWidth, shownWidth + delta)))
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
        aria-valuemin={minWidth}
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
            {items.length > 1 ? (
              <GitGraphCommitsSummary items={items} onJump={commitContext.onJump} />
            ) : (
              <GitGraphCommitInfo item={first} context={commitContext} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
