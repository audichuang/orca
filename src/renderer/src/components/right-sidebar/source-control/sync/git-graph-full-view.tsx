// Fork-only: full-width Git Graph body. Host-agnostic (dialog today, maybe an editor tab later).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
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
import { GitHistoryGraphToolbar } from './git-history-graph-toolbar'
import { GitHistoryGraphLoadMore } from './git-history-graph-host-status'
import { GitHistoryGraphEmptyMessage } from './git-history-graph-empty-message'
import { GIT_GRAPH_FULL_ROW_COLUMNS, GitGraphFullRow } from './git-graph-full-row'
import { GitGraphDetailsPane } from './git-graph-full-view-details'
import {
  useGitHistoryCommitSelection,
  type GitHistoryCommitActionHandler
} from './use-git-history-commit-selection'

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = result?.items.find((item) => item.id === selectedId) ?? null
  const commitSelection = useGitHistoryCommitSelection(result)
  const multiSelected = commitSelection.selectedItems
  const shownItems = useMemo(
    () => (multiSelected.length > 0 ? multiSelected : selected ? [selected] : []),
    [multiSelected, selected]
  )
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-1 border-b border-border pt-1.5 pr-10">
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
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Why both reserve the gutter: the header must lose the same scrollbar width as the rows. */}
          <div
            className={cn(
              'scrollbar-sleek grid shrink-0 items-center gap-x-3 overflow-y-hidden border-b border-border px-3 py-1 text-2xs text-muted-foreground [scrollbar-gutter:stable]',
              GIT_GRAPH_FULL_ROW_COLUMNS
            )}
          >
            <span style={{ width: graphWidth }} />
            <span>
              {translate('auto.components.right.sidebar.GitGraphFullView.message', 'Message')}
            </span>
            <span>
              {translate('auto.components.right.sidebar.GitGraphFullView.author', 'Author')}
            </span>
            <span>{translate('auto.components.right.sidebar.GitGraphFullView.date', 'Date')}</span>
            <span>
              {translate('auto.components.right.sidebar.GitGraphFullView.commit', 'Commit')}
            </span>
          </div>
          <div className="scrollbar-sleek min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
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
                selected={
                  multiSelected.length > 0
                    ? commitSelection.isSelected(viewModel.historyItem.id)
                    : viewModel.historyItem.id === selectedId
                }
                onSelect={(event) => {
                  if (!commitSelection.handleRowClick(viewModel.historyItem, event)) {
                    setSelectedId(viewModel.historyItem.id)
                  }
                }}
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
        />
      </div>
    </div>
  )
}
