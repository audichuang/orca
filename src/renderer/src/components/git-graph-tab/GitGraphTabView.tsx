// Fork-only: the Git Graph editor tab. Loads one repo's history and hosts GitGraphFullView.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { useWorktreeMap } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { getConnectionId, getConnectionIdFromState } from '@/lib/connection-context'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/rpc/targets/runtime-client-target'
import { useTranslate } from '@/i18n/use-translate'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { GitHistoryGraphSavedFilter } from '../../../../shared/git-history-graph-query-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorktreeGitIdentityDisplay } from '../../../../shared/worktree/git-identity-display'
import { GitGraphFullView } from '../right-sidebar/source-control/sync/git-graph-full-view'
import { useSourceControlGitHistory } from '../right-sidebar/source-control/sync/use-git-history'
import { useGitGraphTabFilter } from './use-git-graph-tab-filter'
import { useGitHistoryCommitActions } from '../right-sidebar/source-control/sync/use-git-history-commit-actions'
import { commitFilesMenuSlot } from '../right-sidebar/source-control/sync/git-history-commit-files-menu'
import { FolderAddReposDialog } from '../right-sidebar/source-control/folder/folder-add-repos-dialog'
import { GitGraphRepoSwitcher } from './git-graph-repo-switcher'
import { useGitGraphFolderAddRepos } from './use-git-graph-folder-add-repos'
import {
  listGitGraphRepoChoicesFromInputs,
  selectGitGraphChoiceInputs
} from './git-graph-tab-model'
import { resolveGitGraphSplitTargetGroupId } from './git-graph-split-target'
import type { SourceControlRowOpenEvent } from '../right-sidebar/source-control/listing/split-open'
import { useRepoDisplayColor } from '@/lib/repo-display-color'
import { GIT_GRAPH_REFRESH_EVENT } from '@/lib/git-graph-tab'
import { openSourceControlOnRepo } from './git-graph-source-control-link'
import { useGitGraphTabReveal } from './use-git-graph-tab-reveal'
import { consumeGitGraphFocusRequest, useGitGraphFocusRequest } from './git-graph-focus-request'
import { SourceControlScopeProvider } from '../right-sidebar/source-control/panel/worktree-scope'
import { folderRepoOwner } from '../right-sidebar/source-control/folder/folder-path-repo-owners'

// Upstream keys history reloads on the branch name; a detached tab passes '' like the sidebar.
function worktreeBranchName(worktree: Worktree): string {
  const identity = getWorktreeGitIdentityDisplay(worktree)
  return identity?.kind === 'branch' ? identity.branchName : ''
}

function GitGraphTabBody({
  fileId,
  workspaceId,
  worktree,
  repo,
  hostId,
  switcher,
  toolbarTrailing,
  savedFilter,
  claimFocusOnOpen
}: {
  fileId: string
  workspaceId: string
  worktree: Worktree
  repo: Repo
  hostId: ExecutionHostId
  switcher: React.ReactNode
  toolbarTrailing: React.ReactNode
  savedFilter: GitHistoryGraphSavedFilter | undefined
  claimFocusOnOpen: boolean
}): React.JSX.Element {
  const target = useMemo(() => ipcOrRuntimeTargetForHostId(hostId), [hostId])
  const filterKey = useGitGraphTabFilter(fileId, worktree.id, savedFilter)
  const worktreeMap = useWorktreeMap()
  const repoColor = useRepoDisplayColor()
  // Why: a hidden workspace keeps its tabs mounted; only fetch while this workspace is on screen.
  const isVisible = useAppStore(
    (s) => s.activeWorktreeId === workspaceId && s.activeView === 'terminal'
  )
  const { gitHistoryState, refreshGitHistory, refreshGitHistoryRef } = useSourceControlGitHistory({
    activeRepoTarget: target,
    activeWorktreeId: worktree.id,
    worktreePath: worktree.path,
    branchName: worktreeBranchName(worktree),
    compareBaseRef: null,
    isFolder: false,
    isBranchVisible: isVisible,
    isGitHistoryExpanded: true,
    isGitHistoryVisible: true,
    worktreeMap,
    graphFilterKey: filterKey
  })
  // Why: the sidebar's commit/push/pull refresh only reaches its own history state; follow the
  // repo's head, upstream counts and SSH link instead so this tab never shows stale commits.
  const remote = useAppStore((s) => s.remoteStatusesByWorktree[worktree.id])
  const sshStatus = useAppStore((s) => {
    const connectionId = getConnectionIdFromState(s, worktree.id) ?? repo.connectionId
    return connectionId ? s.sshConnectionStates.get(connectionId)?.status : undefined
  })
  const refreshKey = [
    worktree.head,
    remote?.upstreamName,
    remote?.ahead,
    remote?.behind,
    sshStatus === 'connected'
  ].join('\0')
  const shownRefreshKeyRef = useRef(refreshKey)
  useEffect(() => {
    if (shownRefreshKeyRef.current === refreshKey) {
      return
    }
    shownRefreshKeyRef.current = refreshKey
    if (sshStatus === undefined || sshStatus === 'connected') {
      void refreshGitHistoryRef.current()
    }
  }, [refreshGitHistoryRef, refreshKey, sshStatus])
  // Why: Fetch moves other refs without touching head or ahead/behind; Source Control announces it here.
  useEffect(() => {
    const onRefresh = (event: Event): void => {
      if ((event as CustomEvent<string>).detail === worktree.id) {
        void refreshGitHistoryRef.current()
      }
    }
    window.addEventListener(GIT_GRAPH_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(GIT_GRAPH_REFRESH_EVENT, onRefresh)
  }, [refreshGitHistoryRef, worktree.id])
  const resolveSplitTargetGroupId = useCallback(
    (event?: SourceControlRowOpenEvent) =>
      resolveGitGraphSplitTargetGroupId(useAppStore.getState(), workspaceId, fileId, event),
    [fileId, workspaceId]
  )
  const { loadCommitFiles, openHistoryCommitDiff, openCommitFile, handleCommitAction } =
    useGitHistoryCommitActions({
      activeWorktreeId: worktree.id,
      worktreePath: worktree.path,
      activeRepoTarget: target,
      resolveSplitTargetGroupId
    })
  const revealInExplorer = useAppStore((s) => s.revealInExplorer)
  const reveal = useGitGraphTabReveal(fileId, worktree.id, filterKey)
  const focusRequest = useGitGraphFocusRequest(fileId)
  const onFocusHandled = useCallback(
    (nonce: number) => consumeGitGraphFocusRequest(fileId, nonce),
    [fileId]
  )
  const renderCommitFilesMenu = commitFilesMenuSlot(
    {
      activeConnectionId: getConnectionId(worktree.id) ?? repo.connectionId ?? null,
      activeRepoTarget: target,
      revealInExplorer
    },
    worktree.id,
    worktree.path,
    loadCommitFiles
  )
  return (
    <GitGraphFullView
      key={fileId}
      worktreeId={worktree.id}
      worktreePath={worktree.path}
      activeRepoTarget={target}
      state={gitHistoryState}
      onRefresh={() => void refreshGitHistory({ wakeWslDistro: true })}
      onOpenCommit={(item) => void openHistoryCommitDiff(item)}
      onLoadCommitFiles={loadCommitFiles}
      onOpenCommitFile={openCommitFile}
      onCommitAction={handleCommitAction}
      renderCommitFilesMenu={renderCommitFilesMenu}
      toolbarLeading={switcher}
      toolbarTrailing={toolbarTrailing}
      accentColor={repoColor(repo)}
      filterKey={filterKey}
      selectHeadOnOpen
      tab={{
        selectionScope: fileId,
        claimFocusOnOpen,
        focusRequest: { pending: focusRequest, onHandled: onFocusHandled }
      }}
      reveal={reveal}
    />
  )
}

export default function GitGraphTabView({ file }: { file: OpenFile }): React.JSX.Element {
  const t = useTranslate()
  const workspaceId = file.worktreeId
  const repoWorktreeId = file.gitGraph?.repoWorktreeId ?? null
  const choiceInputs = useAppStore(useShallow(selectGitGraphChoiceInputs))
  // Why from the choices: they are filtered to the workspace's host, so a worktree id another host
  // also publishes cannot resolve there, and a removed repo falls out instead of erroring.
  const choices = useMemo(
    () => listGitGraphRepoChoicesFromInputs(choiceInputs, workspaceId),
    [choiceInputs, workspaceId]
  )
  const choice = choices.find((entry) => entry.worktree.id === repoWorktreeId) ?? null
  const bodyKey = choice ? `${choice.worktree.id}\0${getRepoExecutionHostId(choice.repo)}` : null
  // Why: opening or returning to the tab is the user's gesture; a later repo change follows a pick
  // elsewhere (Source Control's repo list), whose keyboard focus must stay put.
  const [shownBody, setShownBody] = useState({ key: bodyKey, switched: false })
  if (bodyKey !== null && bodyKey !== shownBody.key) {
    setShownBody({ key: bodyKey, switched: shownBody.switched || shownBody.key !== null })
  }
  const setGitGraphTabRepo = useAppStore((s) => s.setGitGraphTabRepo)
  const selectRepo = useCallback(
    (id: string) => setGitGraphTabRepo(file.id, id),
    [file.id, setGitGraphTabRepo]
  )
  const addRepos = useGitGraphFolderAddRepos(workspaceId)
  const [addReposOpen, setAddReposOpen] = useState(false)
  const addReposDialog =
    addReposOpen && addRepos ? (
      <FolderAddReposDialog
        folderWorkspace={addRepos.folderWorkspace}
        onClose={() => setAddReposOpen(false)}
      />
    ) : null
  const openInSourceControlLabel = t(
    'auto.components.gitGraphTab.openInSourceControl',
    'Open in Source Control'
  )
  // Why at the row's end: beside the branches toggle its panel icon read as a twin of that toggle.
  const openInSourceControl = choice ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={openInSourceControlLabel}
          onClick={() => openSourceControlOnRepo(workspaceId, choice.worktree.id)}
        >
          <PanelRight />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {openInSourceControlLabel}
      </TooltipContent>
    </Tooltip>
  ) : null
  const switcher = (
    <>
      <GitGraphRepoSwitcher
        choices={choices}
        value={repoWorktreeId}
        onValueChange={selectRepo}
        addRepos={
          addRepos
            ? {
                label: addRepos.label,
                missingLabel: addRepos.missingLabel,
                hidden: addRepos.allAdded,
                onMenuOpen: addRepos.scan,
                onSelect: () => setAddReposOpen(true)
              }
            : undefined
        }
      />
      {addReposDialog}
    </>
  )
  // Why a scope: commit diffs and file actions open in this tab's workspace (the folder), reading the repo.
  const owner = useMemo(
    () =>
      choice
        ? {
            ...folderRepoOwner(choice.repo, choice.worktree),
            repo: choice.repo,
            placementWorkspaceId: workspaceId
          }
        : null,
    [choice, workspaceId]
  )
  if (!choice || !owner) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        {/* With choices left, the switcher's own "Select repository" prompt is the message. */}
        {choices.length > 0 ? (
          switcher
        ) : (
          <>
            <p>
              {t(
                'auto.components.gitGraphTab.noRepo',
                'No Git repository is available for this workspace.'
              )}
            </p>
            {addRepos && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddReposOpen(true)}
              >
                <FolderPlus />
                {t('auto.components.gitGraphTab.addReposButton', 'Add repositories in this folder')}
              </Button>
            )}
            {addReposDialog}
          </>
        )}
      </div>
    )
  }
  const { worktree, repo } = choice
  const hostId = owner.executionHostId
  return (
    <SourceControlScopeProvider owner={owner}>
      <GitGraphTabBody
        // Why remount per repo and host: selection, filters and caches are seeded once per owner.
        key={bodyKey}
        fileId={file.id}
        workspaceId={workspaceId}
        worktree={worktree}
        repo={repo}
        hostId={hostId}
        switcher={switcher}
        toolbarTrailing={openInSourceControl}
        savedFilter={file.gitGraph?.filter}
        claimFocusOnOpen={!shownBody.switched}
      />
    </SourceControlScopeProvider>
  )
}
