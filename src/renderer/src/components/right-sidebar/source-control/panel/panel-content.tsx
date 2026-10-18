import { GitHistoryPanel } from '../sync/git-history-panel'
import { GitHistoryGraphToolbar } from '../sync/git-history-graph-toolbar'
import { GitHistoryGraphLoadMore } from '../sync/git-history-graph-host-status'
import { GitHistoryGraphEmptyMessage } from '../sync/git-history-graph-empty-message'
import { shouldShowSourceControlCompareUnavailableCard } from './header-toolbar'
import { shouldRenderCommitArea } from '../commit/component-gates'
import { SourceControlBranchSection } from '../listing/branch-section'
import { SourceControlContentStatus } from '../listing/content-status'
import { SourceControlUncommittedSections } from '../listing/uncommitted-sections'
import { CompareUnavailable } from '../sync/compare-summary'
import { SourceControlCommitSurface } from './commit-surface'
import { SourceControlForkPushNotice } from './fork-push-notice'
import { useSourceControlWorktreeScope } from '../folder/worktree-scope'
import type { SourceControlPanelReadyProps } from './panel-props'

export function SourceControlPanelContent(props: SourceControlPanelReadyProps) {
  const { activeWorktree, currentWorktreeId, model, worktreePath } = props
  // Why: in a folder repo section, combined diffs open in the folder's editor but read this repo's git state.
  const scope = useSourceControlWorktreeScope()
  const tabOwnerId = scope?.editorWorktreeId ?? currentWorktreeId
  const gitOwnerId = scope ? currentWorktreeId : undefined
  const {
    activeConnectionId,
    activeRepoTarget,
    activeOpenRowKeys,
    branchEntries,
    branchSummary,
    collapsedSections,
    collapsedTreeDirs,
    conflictOperation,
    copyRowFullSource,
    copySectionFullSource,
    diffCommentCountByPath,
    displaySections,
    expandedSubmoduleKeys,
    fileFilterState,
    fileListScrollElement,
    filterQuery,
    filteredBranchEntries,
    gitHistoryState,
    handleAbortOperationForConflict,
    handleCommitAction,
    handleContextMenu,
    handleOpenDiff,
    handleResolveConflictsWithAI,
    handleSelect,
    handleStage,
    handleStageAllPaths,
    handleStageSectionPaths,
    handleStageWorktreeChanges,
    handleUnstage,
    handleUnstagePaths,
    hasUncommittedEntries,
    isResolvingConflictsWithAI,
    isAbortingOperation,
    isCheckingRecoveryAdmission,
    isExecutingBulk,
    isGitHistoryVisible,
    loadCommitFiles,
    normalizedFilter,
    openAllDiffs,
    openBranchAllDiffs,
    openCommitFile,
    openCommittedDiff,
    openConflictReview,
    openHistoryCommitDiff,
    refreshActiveGitStatus,
    refreshBranchCompare,
    refreshGitHistory,
    repositoryHuge,
    requestDiscardAllInArea,
    requestDiscardEntry,
    requestDiscardPaths,
    revealInExplorer,
    selectedKeySet,
    setBaseRefDialogOpen,
    sourceControlAiActionsVisible,
    sourceControlViewMode,
    toggleSection,
    toggleSubmodule,
    toggleTreeDir,
    unresolvedConflictReviewEntries,
    unresolvedConflicts,
    unfilteredDisplaySectionsById,
    visibleBranchTreeRows,
    visibleListRowsBySection,
    visibleTreeRowsBySection
  } = model

  const hasFilteredUncommittedEntries = displaySections.length > 0
  const hasFilteredBranchEntries = filteredBranchEntries.length > 0
  const showGenericEmptyState =
    !hasUncommittedEntries && branchSummary?.status === 'ready' && branchEntries.length === 0

  return (
    <>
      <SourceControlContentStatus
        unresolvedConflictCount={unresolvedConflictReviewEntries.length}
        conflictOperation={conflictOperation}
        sourceControlAiActionsVisible={sourceControlAiActionsVisible}
        isRecoveryBusy={isCheckingRecoveryAdmission || isResolvingConflictsWithAI}
        isAbortingOperation={isAbortingOperation}
        onAbortOperation={handleAbortOperationForConflict}
        onResolveWithAi={() => void handleResolveConflictsWithAI()}
        onReviewConflicts={() => {
          openConflictReview(
            tabOwnerId,
            worktreePath,
            unresolvedConflictReviewEntries,
            'live-summary',
            gitOwnerId
          )
        }}
        repositoryHuge={repositoryHuge}
        worktreeId={currentWorktreeId}
        onRetryStatus={refreshActiveGitStatus}
        onStageAllChanges={handleStageWorktreeChanges}
        isExecutingBulk={isExecutingBulk}
        showGenericEmptyState={showGenericEmptyState}
        normalizedFilter={normalizedFilter}
        branchBaseRef={branchSummary?.baseRef ?? null}
        filterTooLarge={fileFilterState.tooLarge}
        hasFilteredUncommittedEntries={hasFilteredUncommittedEntries}
        hasFilteredBranchEntries={hasFilteredBranchEntries}
        filterQuery={filterQuery}
      />

      {/* Keep CommitArea through clean/mid-commit states (#1448); only active conflict operations replace the action surface. */}
      <SourceControlForkPushNotice pushTarget={activeWorktree.pushTarget ?? null} />

      {shouldRenderCommitArea(unresolvedConflicts.length, conflictOperation) && (
        <SourceControlCommitSurface {...props} showGenericEmptyState={showGenericEmptyState} />
      )}

      {hasFilteredUncommittedEntries && (
        <SourceControlUncommittedSections
          displaySections={displaySections}
          unfilteredDisplaySectionsById={unfilteredDisplaySectionsById}
          normalizedFilter={normalizedFilter}
          collapsedSections={collapsedSections}
          toggleSection={toggleSection}
          onViewSection={(sectionViewAction) => {
            if (sectionViewAction.kind === 'conflict-review') {
              openConflictReview(
                tabOwnerId,
                worktreePath,
                sectionViewAction.entries,
                'live-summary',
                gitOwnerId
              )
            } else {
              openAllDiffs(
                tabOwnerId,
                worktreePath,
                undefined,
                sectionViewAction.area,
                sectionViewAction.entries,
                gitOwnerId
              )
            }
          }}
          isExecutingBulk={isExecutingBulk}
          requestDiscardAllInArea={requestDiscardAllInArea}
          handleStageAllPaths={handleStageAllPaths}
          handleStageSectionPaths={handleStageSectionPaths}
          onCopyRowFullSource={copyRowFullSource}
          onCopySectionFullSource={copySectionFullSource}
          isStatusTruncated={repositoryHuge !== undefined}
          handleUnstagePaths={handleUnstagePaths}
          sourceControlViewMode={sourceControlViewMode}
          visibleTreeRowsBySection={visibleTreeRowsBySection}
          visibleListRowsBySection={visibleListRowsBySection}
          fileListScrollElement={fileListScrollElement}
          collapsedTreeDirs={collapsedTreeDirs}
          toggleTreeDir={toggleTreeDir}
          requestDiscardPaths={requestDiscardPaths}
          expandedSubmoduleKeys={expandedSubmoduleKeys}
          toggleSubmodule={toggleSubmodule}
          currentWorktreeId={currentWorktreeId}
          worktreePath={worktreePath}
          selectedKeySet={selectedKeySet}
          activeOpenRowKeys={activeOpenRowKeys}
          handleSelect={handleSelect}
          handleContextMenu={handleContextMenu}
          revealInExplorer={revealInExplorer}
          activeConnectionId={activeConnectionId}
          handleOpenDiff={handleOpenDiff}
          handleStage={handleStage}
          handleUnstage={handleUnstage}
          requestDiscardEntry={requestDiscardEntry}
          diffCommentCountByPath={diffCommentCountByPath}
        />
      )}

      {shouldShowSourceControlCompareUnavailableCard(
        branchSummary,
        hasUncommittedEntries,
        branchEntries.length > 0,
        Boolean(normalizedFilter)
      ) && branchSummary ? (
        <CompareUnavailable
          summary={branchSummary}
          onChangeBaseRef={() => setBaseRefDialogOpen(true)}
          onRetry={() => void refreshBranchCompare()}
        />
      ) : null}

      {branchSummary?.status === 'ready' && hasFilteredBranchEntries && (
        <SourceControlBranchSection
          branchSummary={branchSummary}
          filteredBranchEntries={filteredBranchEntries}
          totalBranchEntryCount={branchEntries.length}
          collapsedSections={collapsedSections}
          toggleSection={toggleSection}
          sourceControlViewMode={sourceControlViewMode}
          visibleBranchTreeRows={visibleBranchTreeRows}
          fileListScrollElement={fileListScrollElement}
          collapsedTreeDirs={collapsedTreeDirs}
          toggleTreeDir={toggleTreeDir}
          currentWorktreeId={currentWorktreeId}
          worktreePath={worktreePath}
          revealInExplorer={revealInExplorer}
          activeConnectionId={activeConnectionId}
          openCommittedDiff={openCommittedDiff}
          openBranchAllDiffs={(_worktreeId, path, summary) =>
            openBranchAllDiffs(tabOwnerId, path, summary, undefined, gitOwnerId)
          }
          diffCommentCountByPath={diffCommentCountByPath}
        />
      )}

      {isGitHistoryVisible && (
        // Dock history as reference context while the rest of the pane scrolls.
        <div className="sticky bottom-0 z-10 mt-auto shrink-0 border-t border-border bg-sidebar/95 backdrop-blur-sm">
          <GitHistoryPanel
            state={gitHistoryState}
            collapsed={collapsedSections.has('history')}
            onToggle={() => toggleSection('history')}
            onRefresh={() => void refreshGitHistory()}
            onOpenCommit={(item) => void openHistoryCommitDiff(item)}
            onLoadCommitFiles={loadCommitFiles}
            onOpenCommitFile={openCommitFile}
            onCommitAction={handleCommitAction}
            toolbar={
              <GitHistoryGraphToolbar
                worktreeId={currentWorktreeId}
                worktreePath={worktreePath}
                activeRepoTarget={activeRepoTarget}
                state={gitHistoryState}
              />
            }
            footer={
              <GitHistoryGraphLoadMore worktreeId={currentWorktreeId} state={gitHistoryState} />
            }
            emptyMessage={<GitHistoryGraphEmptyMessage worktreeId={currentWorktreeId} />}
          />
        </div>
      )}
    </>
  )
}
