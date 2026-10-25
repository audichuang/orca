// Fork-only: the full Git Graph's right pane, IntelliJ-style: changed files on top, commit details below.
import React, { useCallback, useMemo, useState } from 'react'
import { ArrowUpRight, Copy, List, ListTree, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitHistoryPanelSlots } from './git-history-panel-slots'
import type { OpenCommitFileHandler } from './commit-file-sequence'
import { mergeCommitFiles } from './git-graph-merged-commit-files'
import {
  GitHistoryCommitFiles,
  type GitHistoryCommitFilesLayout,
  type GitHistoryCommitFilesState
} from './git-history-commit-files'
import {
  GitGraphCommitInfo,
  GitGraphCommitsSummary,
  type GitGraphCommitContext
} from './git-graph-commit-info'

const DETAILS_WIDTH_KEY = 'orca:git-graph-details-width'
const FILES_LAYOUT_KEY = 'orca:git-graph-files-layout'
const DETAILS_COLLAPSED_KEY = 'orca:git-graph-details-collapsed'
const DETAILS_MIN_WIDTH = 280
// Smallest width the pane can take (tiny windows); a saved width at or above it stays valid.
const DETAILS_FLOOR_WIDTH = 200
const DETAILS_DEFAULT_WIDTH = 480
// Margin around the panes, plus the narrowest commit list that still shows message and date.
const DETAILS_RESERVED_CHROME = 112
const COMMIT_LIST_MIN_WIDTH = 460
const isMac = navigator.userAgent.includes('Mac')

// Why view-relative: a flat default left one-file commits in a half-empty pane on laptops.
function defaultDetailsWidth(): number {
  return Math.max(
    DETAILS_MIN_WIDTH,
    Math.min(DETAILS_DEFAULT_WIDTH, Math.round(window.innerWidth * 0.3))
  )
}

function readDetailsWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(DETAILS_WIDTH_KEY))
    return stored >= DETAILS_FLOOR_WIDTH ? stored : defaultDetailsWidth()
  } catch {
    return defaultDetailsWidth()
  }
}

function writeDetailsWidth(width: number): void {
  try {
    window.localStorage.setItem(DETAILS_WIDTH_KEY, String(width))
  } catch {}
}

function readDetailsCollapsed(): boolean {
  try {
    return window.localStorage.getItem(DETAILS_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDetailsCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      window.localStorage.setItem(DETAILS_COLLAPSED_KEY, '1')
    } else {
      window.localStorage.removeItem(DETAILS_COLLAPSED_KEY)
    }
  } catch {}
}

// Why tree by default: like IntelliJ, deep Java/resource paths read better grouped by folder.
function readFilesLayout(): GitHistoryCommitFilesLayout {
  try {
    return window.localStorage.getItem(FILES_LAYOUT_KEY) === 'list' ? 'list' : 'tree'
  } catch {
    return 'tree'
  }
}

function writeFilesLayout(layout: GitHistoryCommitFilesLayout): void {
  try {
    window.localStorage.setItem(FILES_LAYOUT_KEY, layout)
  } catch {}
}

export function GitGraphDetailsPane({
  items,
  filesByCommit,
  onOpenCommit,
  onOpenCommitFile,
  onCopyFullSource,
  renderCommitFilesMenu,
  commitContext,
  viewWidth,
  reservedWidth
}: {
  /** Newest first; empty when nothing is selected. */
  items: readonly GitHistoryItem[]
  filesByCommit: Readonly<Record<string, GitHistoryCommitFilesState>>
  onOpenCommit: (item: GitHistoryItem) => void
  onOpenCommitFile: OpenCommitFileHandler
  onCopyFullSource?: (items: readonly GitHistoryItem[]) => void
  renderCommitFilesMenu?: GitHistoryPanelSlots['renderCommitFilesMenu']
  commitContext: GitGraphCommitContext
  /** Width of the whole Git Graph view; the pane's limits follow it, not the window. */
  viewWidth: number
  /** Width other side panes (the branch tree) take from the view. */
  reservedWidth: number
}): React.JSX.Element {
  const [width, setWidth] = useState(readDetailsWidth)
  // Rule: with nothing selected the pane is a strip; an explicit expand lasts until the next selection.
  // With a selection it is a strip only after Hide details, until Show details.
  const [expandedWhileEmpty, setExpandedWhileEmpty] = useState(false)
  if (items.length > 0 && expandedWhileEmpty) {
    setExpandedWhileEmpty(false)
  }
  // Why remembered: a hide is chosen to read long subjects while stepping through commits.
  const [hidden, setHidden] = useState(readDetailsCollapsed)
  const setDetailsHidden = (next: boolean): void => {
    setHidden(next)
    writeDetailsCollapsed(next)
  }
  const collapsed = items.length === 0 ? !expandedWhileEmpty : hidden
  // Why: the cap leaves the commit list its minimum, and follows resizes of the view.
  // Why a smaller floor on tiny views: a fixed 280px left near-identical subjects unreadable.
  const minWidth = Math.min(
    DETAILS_MIN_WIDTH,
    Math.max(DETAILS_FLOOR_WIDTH, Math.round((viewWidth - DETAILS_RESERVED_CHROME) * 0.42))
  )
  const maxWidth = Math.max(
    minWidth,
    Math.min(
      Math.round(viewWidth * 0.55),
      viewWidth - DETAILS_RESERVED_CHROME - COMMIT_LIST_MIN_WIDTH - reservedWidth
    )
  )
  const shownWidth = Math.max(minWidth, Math.min(width, maxWidth))
  const saveWidth = useCallback((next: number): void => {
    setWidth(next)
    writeDetailsWidth(next)
  }, [])
  const { containerRef, onResizeStart } = useSidebarResize<HTMLDivElement>({
    // Why tied to collapsed: the toggle re-runs the hook's width effect once the pane div mounts.
    isOpen: !collapsed,
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
      const next = Math.min(maxWidth, Math.max(minWidth, shownWidth + delta))
      // Why: at a clamp edge the key changes nothing; saving would pin a narrow-window width.
      if (next !== shownWidth) {
        saveWidth(next)
      }
    }
  }

  const [filesLayout, setFilesLayout] = useState(readFilesLayout)
  const toggleFilesLayout = (): void => {
    const next = filesLayout === 'tree' ? 'list' : 'tree'
    setFilesLayout(next)
    writeFilesLayout(next)
  }
  const layoutLabel =
    filesLayout === 'tree'
      ? translate('auto.components.right.sidebar.SourceControl.a91f8e2b01', 'View as list')
      : translate('auto.components.right.sidebar.SourceControl.b82e9f3c12', 'View as tree')

  const merged = useMemo(() => mergeCommitFiles(items, filesByCommit), [items, filesByCommit])
  const first = items[0]
  const fileCount = merged.state.status === 'ready' ? merged.state.entries.length : null
  const copyLabel = translate(
    'auto.components.right.sidebar.GitGraphFullView.copyFullSource',
    'Copy Full Source of all changed files'
  )
  const openAllLabel = translate(
    'auto.components.right.sidebar.GitGraphFullView.openAllChanges',
    'Open all changes'
  )
  const hideLabel = translate(
    'auto.components.right.sidebar.GitGraphFullView.hideDetails',
    'Hide details'
  )
  const enterKey = isMac
    ? '↩'
    : translate('auto.components.right.sidebar.GitGraphFullView.enterKey', 'Enter')
  const openAllHint = `${openAllLabel} (${enterKey})`

  if (collapsed) {
    const showLabel = translate(
      'auto.components.right.sidebar.GitGraphFullView.showDetails',
      'Show details'
    )
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={showLabel}
            className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-border py-2 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => {
              setDetailsHidden(false)
              setExpandedWhileEmpty(items.length === 0)
            }}
          >
            <PanelRightOpen aria-hidden="true" className="size-3.5" />
            <span aria-hidden="true" className="text-2xs [writing-mode:vertical-rl]">
              {translate('auto.components.right.sidebar.GitGraphFullView.detailsStrip', 'Details')}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={6}>
          {showLabel}
        </TooltipContent>
      </Tooltip>
    )
  }

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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={openAllLabel}
                  disabled={items.length !== 1}
                  onClick={() => onOpenCommit(first)}
                >
                  <ArrowUpRight className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {openAllHint}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={layoutLabel}
                  onClick={toggleFilesLayout}
                >
                  {filesLayout === 'tree' ? (
                    <List className="size-3.5" />
                  ) : (
                    <ListTree className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {layoutLabel}
              </TooltipContent>
            </Tooltip>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={hideLabel}
                  onClick={() => setDetailsHidden(true)}
                >
                  <PanelRightClose className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={6}>
                {hideLabel}
              </TooltipContent>
            </Tooltip>
          </div>
          {/* No onOpenAll: the header button and row double-click/Enter replace the bottom link. */}
          {/* Why the override: the shared list indents for the sidebar tree; align it with the header. */}
          <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto py-1 [&_.pl-9]:pl-3">
            <GitHistoryCommitFiles
              className="border-l-0 bg-transparent"
              state={merged.state}
              layout={filesLayout}
              onOpenFile={(entry, event, shown) =>
                onOpenCommitFile(merged.targetByPath.get(entry.path)?.head ?? first, entry, event, {
                  sequence: shown.entries.flatMap((row) => merged.targetByPath.get(row.path) ?? [])
                })
              }
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
