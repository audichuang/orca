// Fork-only: the Git Graph editor tab. Loads one repo's history and hosts GitGraphFullView.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { useAllWorktrees, useRepoMap, useWorktreeMap } from '@/store/selectors'
import type { OpenFile } from '@/store/slices/editor'
import { getConnectionId, getConnectionIdFromState } from '@/lib/connection-context'
import { ipcOrRuntimeTargetForHostId } from '@/runtime/runtime-client-target'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { GitGraphFullView } from '../right-sidebar/source-control/sync/git-graph-full-view'
import { useSourceControlGitHistory } from '../right-sidebar/source-control/sync/use-git-history'
import { useGitHistoryCommitActions } from '../right-sidebar/source-control/sync/use-git-history-commit-actions'
import { commitFilesMenuSlot } from '../right-sidebar/source-control/sync/git-history-commit-files-menu'
import { FolderAddReposDialog } from '../right-sidebar/source-control/folder/folder-add-repos-dialog'
import { GitGraphRepoSwitcher } from './git-graph-repo-switcher'
import { useGitGraphFolderAddRepos } from './use-git-graph-folder-add-repos'
import { listGitGraphRepoChoices } from './git-graph-tab-model'
import { resolveGitGraphSplitTargetGroupId } from './git-graph-split-target'
import type { SourceControlRowOpenEvent } from '../right-sidebar/source-control/listing/split-open'

function GitGraphTabBody({
  fileId,
  workspaceId,
  worktree,
  repo,
  hostId,
  switcher
}: {
  fileId: string
  workspaceId: string
  worktree: Worktree
  repo: Repo
  hostId: ExecutionHostId
  switcher: React.ReactNode
}): React.JSX.Element {
  const target = useMemo(() => ipcOrRuntimeTargetForHostId(hostId), [hostId])
  const worktreeMap = useWorktreeMap()
  // Why: a hidden workspace keeps its tabs mounted; only fetch while this workspace is on screen.
  const isVisible = useAppStore(
    (s) => s.activeWorktreeId === workspaceId && s.activeView === 'terminal'
  )
  const { gitHistoryState, refreshGitHistory, refreshGitHistoryRef } = useSourceControlGitHistory({
    activeRepoTarget: target,
    activeWorktreeId: worktree.id,
    worktreePath: worktree.path,
    compareBaseRef: null,
    isFolder: false,
    isBranchVisible: isVisible,
    isGitHistoryExpanded: true,
    isGitHistoryVisible: true,
    worktreeMap
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
  const resolveSplitTargetGroupId = useCallback(
    (event?: SourceControlRowOpenEvent) =>
      resolveGitGraphSplitTargetGroupId(useAppStore.getState(), workspaceId, fileId, event),
    [fileId, workspaceId]
  )
  const { loadCommitFiles, openHistoryCommitDiff, openCommitFile, handleCommitAction } =
    useGitHistoryCommitActions({
      activeWorktreeId: worktree.id,
      editorWorktreeId: workspaceId,
      worktreePath: worktree.path,
      activeRepoTarget: target,
      resolveSplitTargetGroupId
    })
  const revealInExplorer = useAppStore((s) => s.revealInExplorer)
  const renderCommitFilesMenu = commitFilesMenuSlot(
    {
      activeConnectionId: getConnectionId(worktree.id) ?? repo.connectionId ?? null,
      activeRepoTarget: target,
      editorWorktreeId: workspaceId,
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
      onRefresh={() => void refreshGitHistory()}
      onOpenCommit={(item) => void openHistoryCommitDiff(item)}
      onLoadCommitFiles={loadCommitFiles}
      onOpenCommitFile={openCommitFile}
      onCommitAction={handleCommitAction}
      renderCommitFilesMenu={renderCommitFilesMenu}
      toolbarTrailing={switcher}
    />
  )
}

export default function GitGraphTabView({ file }: { file: OpenFile }): React.JSX.Element {
  const workspaceId = file.worktreeId
  const repoWorktreeId = file.gitGraph?.repoWorktreeId ?? null
  const worktrees = useAllWorktrees()
  const repoById = useRepoMap()
  const folderWorkspaces = useAppStore((s) => s.folderWorkspaces)
  // Why from the choices: they are filtered to the workspace's host, so a worktree id another host
  // also publishes cannot resolve there, and a removed repo falls out instead of erroring.
  const choices = useMemo(
    () => listGitGraphRepoChoices(workspaceId, worktrees, repoById, folderWorkspaces ?? []),
    [folderWorkspaces, repoById, workspaceId, worktrees]
  )
  const choice = choices.find((entry) => entry.worktree.id === repoWorktreeId) ?? null
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
  if (!choice) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        {/* With choices left, the switcher's own "Select repository" prompt is the message. */}
        {choices.length > 0 ? (
          switcher
        ) : (
          <>
            <p>
              {translate(
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
                {translate(
                  'auto.components.gitGraphTab.addReposButton',
                  'Add repositories in this folder'
                )}
              </Button>
            )}
            {addReposDialog}
          </>
        )}
      </div>
    )
  }
  const { worktree, repo } = choice
  const hostId = getRepoExecutionHostId(repo)
  return (
    <GitGraphTabBody
      // Why remount per repo and host: selection, filters and caches are seeded once per owner.
      key={`${worktree.id}\0${hostId}`}
      fileId={file.id}
      workspaceId={workspaceId}
      worktree={worktree}
      repo={repo}
      hostId={hostId}
      switcher={switcher}
    />
  )
}
