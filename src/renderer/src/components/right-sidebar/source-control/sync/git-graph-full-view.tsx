// Fork-only: full-width Git Graph body. Host-agnostic; the Git Graph editor tab hosts it today.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitBranchChangeEntry } from '../../../../../../shared/git-diff-compare-types'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels
} from '../../../../../../shared/git-history-graph'
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import type { GitHistoryPanelState } from './git-history-panel'
import type { GitHistoryPanelSlots } from './git-history-panel-slots'
import type { GitHistoryCommitFilesState } from './git-history-commit-files'
import { GitHistoryGraphLoadMore } from './git-history-graph-host-status'
import { GitHistoryGraphEmptyMessage } from './git-history-graph-empty-message'
import {
  GitGraphFullRow,
  gitGraphColumnsForWidth,
  gitGraphGridTemplate
} from './git-graph-full-row'
import { GitGraphDetailsPane } from './git-graph-full-view-details'
import { buildGitGraphLaneRows } from './git-graph-lane-layout'
import { SWIMLANE_WIDTH } from './git-history-graph-svg'
import { GitHistoryCommitContextMenu } from './git-history-commit-context-menu'
import { GIT_GRAPH_BRANCH_SIDEBAR_WIDTH, GitGraphBranchSidebar } from './git-graph-branch-sidebar'
import { updateGitHistoryGraphFilter } from './git-history-graph-filter'
import { GitHistoryGraphToolbar } from './git-history-graph-toolbar'
import { useGitGraphBranchContext, useGitGraphSelection } from './use-git-graph-full-view-state'
import { useGitGraphBranchTree } from './use-git-graph-branch-tree'
import { useWindowWidth } from '../../use-window-width'
import { useMeasuredWidth } from '../../right-sidebar-measured-width'
import { useGitGraphOpenFocus } from './use-git-graph-open-focus'
import { composeWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getRuntimeTargetHostId } from '@/runtime/runtime-client-target'
import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { GitHistoryCommitActionHandler } from './use-git-history-commit-selection'

// Why bounded: a Shift range can cover hundreds of commits; the runtime RPC queue rejects past 256.
const FILE_LOAD_CONCURRENCY = 6

export type GitGraphFullViewProps = {
  worktreeId: string
  worktreePath: string
  activeRepoTarget: RuntimeClientTarget | null
  state: GitHistoryPanelState
  onRefresh: () => void
  onOpenCommit: (item: GitHistoryItem) => void
  onLoadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  onOpenCommitFile: (
    item: GitHistoryItem,
    entry: GitBranchChangeEntry,
    event?: SourceControlRowOpenEvent
  ) => void
  /** Commit actions (Copy Full Source) over the selected commits. */
  onCommitAction?: GitHistoryCommitActionHandler
  renderCommitFilesMenu?: GitHistoryPanelSlots['renderCommitFilesMenu']
  /** Host controls at the end of the filter row. */
  toolbarTrailing?: React.ReactNode
  /** Host controls at the start of the toolbar row (the tab's repo switcher). */
  toolbarLeading?: React.ReactNode
  /** The shown repo's badge colour, drawn as a bar along the toolbar's top edge. */
  accentColor?: string
  /** Whose filter the view reads and edits; defaults to the worktree's (shared with the sidebar). */
  filterKey?: string
  /** Select the checked-out commit when the first history arrives and nothing is selected yet. */
  selectHeadOnOpen?: boolean
}

function useCommitFiles(
  result: GitHistoryResult | undefined,
  onLoadCommitFiles: GitGraphFullViewProps['onLoadCommitFiles']
): {
  filesByCommit: Record<string, GitHistoryCommitFilesState>
  ensureFiles: (item: GitHistoryItem) => void
} {
  const [filesByCommit, setFilesByCommit] = useState<Record<string, GitHistoryCommitFilesState>>({})
  const requestedRef = useRef(new Set<string>())
  // Why: a new result can replace commits; drop cached lists like the sidebar panel does.
  const [shownResult, setShownResult] = useState(result)
  if (shownResult !== result) {
    setShownResult(result)
    setFilesByCommit({})
    requestedRef.current = new Set()
  }
  const ensureFiles = useCallback(
    (item: GitHistoryItem): void => {
      const requested = requestedRef.current
      if (requested.has(item.id)) {
        return
      }
      requested.add(item.id)
      setFilesByCommit((prev) => ({ ...prev, [item.id]: { status: 'loading' } }))
      onLoadCommitFiles(item)
        .then((entries) => {
          if (requestedRef.current === requested) {
            setFilesByCommit((prev) => ({ ...prev, [item.id]: { status: 'ready', entries } }))
          }
        })
        .catch((error: unknown) => {
          if (requestedRef.current !== requested) {
            return
          }
          requested.delete(item.id)
          const message = error instanceof Error ? error.message : String(error)
          setFilesByCommit((prev) => ({ ...prev, [item.id]: { status: 'error', error: message } }))
        })
    },
    [onLoadCommitFiles]
  )
  return { filesByCommit, ensureFiles }
}

export function GitGraphFullView({
  worktreeId,
  worktreePath,
  activeRepoTarget,
  state,
  onRefresh,
  onOpenCommit,
  onLoadCommitFiles,
  onOpenCommitFile,
  onCommitAction,
  renderCommitFilesMenu,
  toolbarTrailing,
  toolbarLeading,
  accentColor,
  filterKey = worktreeId,
  selectHeadOnOpen = false
}: GitGraphFullViewProps): React.JSX.Element {
  const result = state.result
  const viewModels = useMemo(
    () =>
      result
        ? buildGitHistoryViewModels(
            result.items,
            buildDefaultGitHistoryColorMap(result),
            result.currentRef,
            result.remoteRef,
            result.baseRef,
            result.hasIncomingChanges,
            result.hasOutgoingChanges,
            result.mergeBase
          )
        : [],
    [result]
  )
  const laneRows = useMemo(() => buildGitGraphLaneRows(viewModels), [viewModels])
  const graphWidth = useMemo(
    () => SWIMLANE_WIDTH * (Math.max(1, ...laneRows.map((row) => row.laneCount)) + 1),
    [laneRows]
  )
  const listRef = useRef<HTMLDivElement>(null)
  // Why the worktree's execution host, not the runtime target: a direct SSH repo uses the local
  // target, and two hosts can publish the same worktree id and path.
  const executionHostId = useAppStore((state) => getExecutionHostIdForWorktree(state, worktreeId))
  // Why the serving endpoint too: an SSH target id is relative to the endpoint that serves it
  // (direct vs. behind a paired server), and an unresolved owner becoming resolved must refetch.
  const ownerKey = `${composeWorktreeHostIdentity(executionHostId, worktreeId)}\0${worktreePath}\0${activeRepoTarget ? getRuntimeTargetHostId(activeRepoTarget) : ''}`
  const selection = useGitGraphSelection({
    selectionKey: ownerKey,
    result,
    viewModels,
    listRef,
    selectHeadOnOpen
  })
  const { shownItems, jumpTo } = selection
  const branchContext = useGitGraphBranchContext({
    ownerKey,
    worktreeId,
    filterKey,
    worktreePath,
    activeRepoTarget,
    result,
    viewModels,
    jumpTo
  })
  const { containment, headRefId } = branchContext
  // Why the view's own width: a tab shares the window with sidebars and splits; 0 means unmeasured (hidden, jsdom).
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const rootRef = useMeasuredWidth(setMeasuredWidth)
  const windowWidth = useWindowWidth() ?? 0
  const viewWidth = measuredWidth || windowWidth
  const [listWidth, setListWidth] = useState<number | null>(null)
  const listColumnRef = useMeasuredWidth(setListWidth)
  const columns = useMemo(() => gitGraphColumnsForWidth(listWidth), [listWidth])
  const tree = useGitGraphBranchTree({
    viewWidth,
    result,
    getNavigationGeneration: selection.getNavigationGeneration,
    jumpTo,
    showRef: (fullName) =>
      updateGitHistoryGraphFilter(filterKey, { scope: 'refs', refs: [fullName] })
  })
  useGitGraphOpenFocus(listRef, selection.cursorId)
  // Why containment: React bubbles keydown out of portaled popovers too, and their Escape is theirs.
  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (
      event.key !== 'Escape' ||
      event.defaultPrevented ||
      !(event.target instanceof Node) ||
      !event.currentTarget.contains(event.target)
    ) {
      return
    }
    if (tree.dismissOverlay()) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  // Why like the sidebar: a right-click inside the selection acts on all of it, else on that row.
  const selectedTipIds = useMemo(() => new Set(shownItems.map((item) => item.id)), [shownItems])
  const contextItemsFor = (item: GitHistoryItem): readonly GitHistoryItem[] =>
    shownItems.length > 1 && selectedTipIds.has(item.id) ? shownItems : [item]
  const { filesByCommit, ensureFiles } = useCommitFiles(result, onLoadCommitFiles)
  const loading = state.status === 'loading' || state.status === 'refreshing'

  // Why an effect: a refresh drops the file cache but keeps the selection, so it must refetch too.
  useEffect(() => {
    const inFlight = shownItems.filter((item) => filesByCommit[item.id]?.status === 'loading')
    const missing = shownItems.filter((item) => !filesByCommit[item.id])
    for (const item of missing.slice(0, Math.max(0, FILE_LOAD_CONCURRENCY - inFlight.length))) {
      ensureFiles(item)
    }
  }, [shownItems, filesByCommit, ensureFiles])

  return (
    <div
      ref={rootRef}
      // Why focusable: a click on a non-focusable spot keeps focus here, so Escape still reaches the handler.
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col outline-none"
      data-git-graph-root=""
      onKeyDown={handleRootKeyDown}
    >
      {accentColor && (
        <div
          data-git-graph-accent=""
          className="h-0.5 shrink-0"
          style={{ backgroundColor: accentColor }}
        />
      )}
      <div className="flex items-start gap-1 border-b border-border pt-1.5">
        {toolbarLeading && (
          <div className="ml-2 flex h-6 max-w-72 min-w-0 shrink-0 items-center gap-1.5">
            {toolbarLeading}
            <Separator orientation="vertical" className="h-4" />
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          ref={tree.toggleRef}
          className="ml-2"
          aria-pressed={tree.open}
          onClick={tree.toggle}
          aria-label={translate(
            'auto.components.right.sidebar.GitGraphFullView.toggleBranches',
            'Toggle branches'
          )}
        >
          <PanelLeft className="size-3.5" />
        </Button>
        <div className="min-w-0 flex-1">
          <GitHistoryGraphToolbar
            worktreeId={worktreeId}
            worktreePath={worktreePath}
            activeRepoTarget={activeRepoTarget}
            state={state}
            trailing={toolbarTrailing}
            fullView
            filterKey={filterKey}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRefresh}
          aria-label={translate(
            'auto.components.right.sidebar.GitHistoryPanel.d0fb0f4bf2',
            'Refresh commits'
          )}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1">
        {tree.open && (
          <div
            className={cn(
              'flex min-h-0',
              tree.overlay && 'absolute inset-y-0 left-0 z-20 bg-background shadow-lg'
            )}
          >
            <GitGraphBranchSidebar
              result={result}
              refOptions={branchContext.refOptions}
              headRefId={headRefId}
              selectedTipIds={selectedTipIds}
              onJump={tree.onJump}
              onShowRef={tree.onShowRef}
            />
          </div>
        )}
        <div ref={listColumnRef} className="flex min-w-0 flex-1 flex-col">
          {/* Why both reserve the gutter: the header must lose the same scrollbar width as the rows. */}
          <div
            data-git-graph-header=""
            className="scrollbar-sleek grid shrink-0 items-center gap-x-3 overflow-hidden border-b border-border px-3 py-1 text-2xs text-muted-foreground [scrollbar-gutter:stable]"
            style={{ gridTemplateColumns: gitGraphGridTemplate(columns) }}
          >
            <span data-col="graph" style={{ width: graphWidth }} />
            <span data-col="message">
              {translate('auto.components.right.sidebar.GitGraphFullView.message', 'Message')}
            </span>
            {columns.author && (
              <span data-col="author">
                {translate('auto.components.right.sidebar.GitGraphFullView.author', 'Author')}
              </span>
            )}
            {columns.date && (
              <span data-col="date">
                {translate('auto.components.right.sidebar.GitGraphFullView.date', 'Date')}
              </span>
            )}
            {columns.hash && (
              <span data-col="hash">
                {translate('auto.components.right.sidebar.GitGraphFullView.commit', 'Commit')}
              </span>
            )}
          </div>
          <div
            ref={listRef}
            data-git-graph-list=""
            tabIndex={-1}
            className="scrollbar-sleek min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]"
            onKeyDown={selection.handleListKeyDown}
          >
            {state.status === 'error' && !result && (
              <p className="px-3 py-2 text-xs text-destructive">{state.error}</p>
            )}
            {!result && state.status !== 'error' && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.GitHistoryPanel.781a8bcf7b',
                  'Loading graph...'
                )}
              </p>
            )}
            {result && viewModels.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                <GitHistoryGraphEmptyMessage worktreeId={filterKey} filterActions />
              </div>
            )}
            {viewModels.map((viewModel, index) => (
              <GitGraphFullRow
                key={viewModel.historyItem.id}
                viewModel={viewModel}
                lanes={laneRows[index]!}
                graphWidth={graphWidth}
                columns={columns}
                selected={selection.isRowSelected(viewModel.historyItem.id)}
                isTabStop={viewModel.historyItem.id === selection.cursorId}
                headRefId={headRefId}
                dimmed={
                  branchContext.canDim &&
                  headRefId !== undefined &&
                  !(containment.get(viewModel.historyItem.id) ?? []).includes(headRefId)
                }
                contextMenu={
                  onCommitAction && (
                    <GitHistoryCommitContextMenu
                      item={viewModel.historyItem}
                      selectedCount={contextItemsFor(viewModel.historyItem).length}
                      onAction={(action, target) =>
                        onCommitAction(action, target, contextItemsFor(target))
                      }
                    />
                  )
                }
                onSelect={(event) => selection.handleRowSelect(viewModel.historyItem, event)}
                onJump={(commitId) => jumpTo(commitId, { focus: true })}
                onOpen={() => onOpenCommit(viewModel.historyItem)}
              />
            ))}
            {result && <GitHistoryGraphLoadMore worktreeId={filterKey} state={state} />}
          </div>
        </div>
        <GitGraphDetailsPane
          items={shownItems}
          filesByCommit={filesByCommit}
          onOpenCommit={onOpenCommit}
          onOpenCommitFile={onOpenCommitFile}
          onCopyFullSource={
            onCommitAction
              ? (items) => items[0] && onCommitAction('copy-full-source', items[0], items)
              : undefined
          }
          renderCommitFilesMenu={renderCommitFilesMenu}
          commitContext={branchContext.commitContext}
          viewWidth={viewWidth}
          reservedWidth={tree.open && !tree.overlay ? GIT_GRAPH_BRANCH_SIDEBAR_WIDTH : 0}
        />
      </div>
    </div>
  )
}
