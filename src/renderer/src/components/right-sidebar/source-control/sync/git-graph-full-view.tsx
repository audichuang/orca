// Fork-only: full-width Git Graph body. Host-agnostic (dialog today, maybe an editor tab later).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  GIT_GRAPH_AUTHOR_COLUMN,
  GIT_GRAPH_DATE_COLUMN,
  GIT_GRAPH_FULL_ROW_COLUMNS,
  GIT_GRAPH_HASH_COLUMN,
  GitGraphFullRow
} from './git-graph-full-row'
import { GitGraphDetailsPane } from './git-graph-full-view-details'
import { GIT_GRAPH_BRANCH_SIDEBAR_WIDTH, GitGraphBranchSidebar } from './git-graph-branch-sidebar'
import { updateGitHistoryGraphFilter } from './git-history-graph-filter'
import { GitHistoryGraphToolbar } from './git-history-graph-toolbar'
import { useGitGraphBranchContext, useGitGraphSelection } from './use-git-graph-full-view-state'
import { useWindowWidth } from '../../use-window-width'
import { composeWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getRuntimeTargetHostId } from '@/runtime/runtime-client-target'
import type { GitHistoryCommitActionHandler } from './use-git-history-commit-selection'

// Why: below this the branch tree would squeeze the commit list; it stays one click away.
const SIDEBAR_AUTO_OPEN_MIN_WIDTH = 1200
// Branch tree + details minimum + commit list minimum + dialog chrome; below it the tree cannot open.
const SIDEBAR_FIT_MIN_WIDTH = 1080

// Why bounded: a Shift range can cover hundreds of commits; the runtime RPC queue rejects past 256.
const FILE_LOAD_CONCURRENCY = 6

// Mirrors SWIMLANE_WIDTH in git-history-graph-svg.tsx; only used to align the subject column.
const GRAPH_LANE_WIDTH = 11

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
  renderCommitFilesMenu
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
  const graphWidth = useMemo(
    () =>
      GRAPH_LANE_WIDTH *
      (Math.max(
        1,
        ...viewModels.map((vm) => Math.max(vm.inputSwimlanes.length, vm.outputSwimlanes.length))
      ) +
        1),
    [viewModels]
  )
  const listRef = useRef<HTMLDivElement>(null)
  const selection = useGitGraphSelection({
    selectionKey: composeWorktreeHostIdentity(
      activeRepoTarget ? getRuntimeTargetHostId(activeRepoTarget) : undefined,
      worktreeId
    ),
    result,
    viewModels,
    listRef
  })
  const { shownItems, jumpTo } = selection
  const branchContext = useGitGraphBranchContext({
    worktreeId,
    worktreePath,
    activeRepoTarget,
    result,
    viewModels,
    jumpTo
  })
  const { containment, headRefId } = branchContext
  const windowWidth = useWindowWidth() ?? SIDEBAR_AUTO_OPEN_MIN_WIDTH
  const [sidebarPreference, setSidebarPreference] = useState<boolean | null>(null)
  const sidebarFits = windowWidth >= SIDEBAR_FIT_MIN_WIDTH
  const sidebarOpen = sidebarPreference ?? windowWidth >= SIDEBAR_AUTO_OPEN_MIN_WIDTH
  // Why an overlay when it does not fit: docking it would crush the commit list, but hiding it
  // outright would cut off branch and tag navigation on small windows.
  const sidebarOverlay = sidebarOpen && !sidebarFits
  // Why once, and only while focus is untouched: opening lands on the commit list (IntelliJ's log),
  // but history that arrives later must not pull focus out of a control the user already chose.
  const focusedOnOpenRef = useRef(false)
  useEffect(() => {
    const list = listRef.current
    if (focusedOnOpenRef.current || !list) {
      return
    }
    const active = document.activeElement
    const root = list.closest('[data-git-graph-root]')
    if (active && active !== list && root?.contains(active)) {
      focusedOnOpenRef.current = true
      return
    }
    const row = list.querySelector<HTMLElement>('[tabindex="0"]')
    if (row) {
      focusedOnOpenRef.current = true
      row.focus({ preventScroll: true })
    } else {
      // Placeholder while history loads; a later row may take over only from here.
      list.focus({ preventScroll: true })
    }
  }, [selection.cursorId])
  const toggleRef = useRef<HTMLButtonElement>(null)
  const selectedTipIds = useMemo(() => new Set(shownItems.map((item) => item.id)), [shownItems])
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
    <div className="flex h-full min-h-0 flex-col" data-git-graph-root="">
      <div className="flex items-start gap-1 border-b border-border pt-1.5 pr-10">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          ref={toggleRef}
          className="ml-2"
          aria-pressed={sidebarOpen}
          onClick={() => setSidebarPreference(!sidebarOpen)}
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
        {sidebarOpen && (
          <div
            className={cn(
              'flex min-h-0',
              sidebarOverlay && 'absolute inset-y-0 left-0 z-20 bg-background shadow-lg'
            )}
          >
            <GitGraphBranchSidebar
              result={result}
              refOptions={branchContext.refOptions}
              headRefId={headRefId}
              selectedTipIds={selectedTipIds}
              onJump={(commitId) => {
                // Why focus: closing the overlay removes the focused tree button with it.
                jumpTo(commitId, { focus: sidebarOverlay })
                if (sidebarOverlay) {
                  setSidebarPreference(false)
                }
              }}
              onShowRef={(fullName) => {
                updateGitHistoryGraphFilter(worktreeId, { scope: 'refs', refs: [fullName] })
                if (sidebarOverlay) {
                  toggleRef.current?.focus()
                  setSidebarPreference(false)
                }
              }}
            />
          </div>
        )}
        <div className="@container flex min-w-0 flex-1 flex-col">
          {/* Why both reserve the gutter: the header must lose the same scrollbar width as the rows. */}
          <div
            className={cn(
              'scrollbar-sleek grid shrink-0 items-center gap-x-3 overflow-hidden border-b border-border px-3 py-1 text-2xs text-muted-foreground [scrollbar-gutter:stable]',
              GIT_GRAPH_FULL_ROW_COLUMNS
            )}
          >
            <span style={{ width: graphWidth }} />
            <span>
              {translate('auto.components.right.sidebar.GitGraphFullView.message', 'Message')}
            </span>
            <span className={GIT_GRAPH_AUTHOR_COLUMN}>
              {translate('auto.components.right.sidebar.GitGraphFullView.author', 'Author')}
            </span>
            <span className={GIT_GRAPH_DATE_COLUMN}>
              {translate('auto.components.right.sidebar.GitGraphFullView.date', 'Date')}
            </span>
            <span className={GIT_GRAPH_HASH_COLUMN}>
              {translate('auto.components.right.sidebar.GitGraphFullView.commit', 'Commit')}
            </span>
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
                <GitHistoryGraphEmptyMessage worktreeId={worktreeId} />
              </div>
            )}
            {viewModels.map((viewModel) => (
              <GitGraphFullRow
                key={viewModel.historyItem.id}
                viewModel={viewModel}
                graphWidth={graphWidth}
                selected={selection.isRowSelected(viewModel.historyItem.id)}
                isTabStop={viewModel.historyItem.id === selection.cursorId}
                headRefId={headRefId}
                dimmed={
                  branchContext.canDim &&
                  headRefId !== undefined &&
                  !(containment.get(viewModel.historyItem.id) ?? []).includes(headRefId)
                }
                onSelect={(event) => selection.handleRowSelect(viewModel.historyItem, event)}
              />
            ))}
            {result && <GitHistoryGraphLoadMore worktreeId={worktreeId} state={state} />}
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
          reservedWidth={sidebarOpen && !sidebarOverlay ? GIT_GRAPH_BRANCH_SIDEBAR_WIDTH : 0}
        />
      </div>
    </div>
  )
}
