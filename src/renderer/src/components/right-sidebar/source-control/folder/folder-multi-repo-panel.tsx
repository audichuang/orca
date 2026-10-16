import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardPaste, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useAllWorktrees, useRepoMap } from '@/store/selectors'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { copyClipcodeGitChanges } from '../clipcode/clipcode-copy-action'
import { useClipcodeRestore } from '../clipcode/use-clipcode-restore'
import { ActionButton } from '../listing/action-button'
import { SourceControlSingleRepoPanel } from '../panel/single-repo-panel'
import { countHiddenFolderWorktrees, getFolderGitWorktrees } from './folder-git-worktrees'
import {
  getRememberedFolderRepo,
  moveRepoSelection,
  rememberFolderRepo,
  resolveSelectedRepoId,
  isFolderRepoSelectionKey
} from './folder-repo-selection'
import { folderRepoSectionLabel } from './folder-section-label'
import { useFolderRepoStatusRefresh } from './use-folder-repo-status-refresh'
import { SourceControlWorktreeScopeContext } from './worktree-scope'

/**
 * Source Control for a folder workspace: a repo list on top and, below it, the selected repo's
 * regular single-repo panel pinned to that repo, so staging,
 * commit, sync and diffs behave exactly as in a repo workspace.
 */
export function FolderMultiRepoPanel({ folderWorkspaceKey }: { folderWorkspaceKey: string }) {
  const scope = parseWorkspaceKey(folderWorkspaceKey)
  const folderWorkspaceId = scope?.type === 'folder' ? scope.folderWorkspaceId : null
  const folderWorkspace = useAppStore(
    (s) => s.folderWorkspaces.find((workspace) => workspace.id === folderWorkspaceId) ?? null
  )
  const worktrees = useAllWorktrees()
  const repoById = useRepoMap()
  const members = useMemo(
    () => (folderWorkspace ? getFolderGitWorktrees(folderWorkspace, worktrees, repoById) : []),
    [folderWorkspace, repoById, worktrees]
  )
  const detectedByRepo = useAppStore((s) => s.detectedWorktreesByRepo)
  const hiddenCount = useMemo(
    () =>
      folderWorkspace ? countHiddenFolderWorktrees(folderWorkspace, detectedByRepo, repoById) : 0,
    [detectedByRepo, folderWorkspace, repoById]
  )
  const hiddenNotice =
    hiddenCount > 0
      ? translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.5de321918e',
          'Hidden worktrees under this folder are not included ({{value0}}).',
          { value0: hiddenCount }
        )
      : null
  const memberWorktrees = useMemo(() => members.map((member) => member.worktree), [members])
  const isVisible = useAppStore((s) => s.rightSidebarOpen && s.rightSidebarTab === 'source-control')
  const refreshAll = useFolderRepoStatusRefresh(memberWorktrees, isVisible)
  const changeCounts = useAppStore(
    useShallow((s) =>
      members.map((member) => s.gitStatusByWorktree[member.worktree.id]?.length ?? 0)
    )
  )
  const [chosenId, setChosenId] = useState<string | null>(() =>
    getRememberedFolderRepo(folderWorkspaceKey)
  )
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const memberIds = members.map((member) => member.worktree.id)
  const firstMemberId = memberIds[0]
  const firstDirtyId = memberIds[changeCounts.findIndex((count) => count > 0)]
  const statusLoaded = useAppStore((s) =>
    members.every((member) => s.gitStatusByWorktree[member.worktree.id] !== undefined)
  )
  // Why: freeze the landing repo once known, so later count changes (a commit, a poll) never move the selection.
  useEffect(() => {
    if (defaultId === null && (firstDirtyId || (statusLoaded && firstMemberId))) {
      setDefaultId(firstDirtyId ?? firstMemberId)
    }
  }, [defaultId, firstDirtyId, firstMemberId, statusLoaded])
  const selectedId = resolveSelectedRepoId({ chosenId, defaultId, ids: memberIds, firstDirtyId })
  const selectRepo = useCallback(
    (id: string) => {
      setChosenId(id)
      rememberFolderRepo(folderWorkspaceKey, id)
    },
    [folderWorkspaceKey]
  )
  const selectedMember = members.find((member) => member.worktree.id === selectedId)
  const selectedLabel = selectedMember ? folderRepoSectionLabel(selectedMember, members) : undefined
  const listRef = useRef<HTMLDivElement>(null)
  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (!isFolderRepoSelectionKey(event.key)) {
      return
    }
    const nextId = moveRepoSelection(memberIds, selectedId, event.key)
    if (nextId === undefined) {
      return
    }
    event.preventDefault()
    selectRepo(nextId)
    listRef.current
      ?.querySelectorAll<HTMLElement>('[data-repo-row]')
      [memberIds.indexOf(nextId)]?.focus()
  }

  const folderPath = folderWorkspace?.folderPath ?? ''
  const repoWorktrees = useMemo(
    () => members.map((member) => ({ id: member.worktree.id, path: member.worktree.path })),
    [members]
  )
  const { requestRestore, dialog: restoreDialog } = useClipcodeRestore({
    folderWorkspaceKey,
    folderPath,
    repoWorktrees,
    onRestored: () => void refreshAll()
  })
  const copyAllChanges = useCallback(() => {
    const state = useAppStore.getState()
    for (const member of members) {
      if (state.gitStatusHugeByWorktree?.[member.worktree.id]) {
        toast.warning(
          translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.efd34a4169',
            'Changes list for {{value0}} is truncated; copy is incomplete.',
            { value0: member.repo.displayName }
          )
        )
      }
    }
    if (hiddenNotice) {
      toast.info(hiddenNotice)
    }
    void copyClipcodeGitChanges({
      rootPath: folderPath,
      requests: members.map((member) => ({
        worktree: member.worktree,
        entries: state.gitStatusByWorktree[member.worktree.id] ?? [],
        forceIndexForStaged: false
      }))
    })
  }, [folderPath, hiddenNotice, members])

  if (!folderWorkspace) {
    return null
  }
  if (members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground px-4 text-center">
        {translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.4c62351467',
          'No imported Git repositories under this folder. Add the repositories inside it to Orca to see their changes here.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border pl-3 pr-2 py-1">
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold"
          title={folderWorkspace.folderPath}
        >
          {folderWorkspace.name}
        </span>
        <ActionButton
          icon={Copy}
          title={translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.d98e7b731c',
            'Copy all changes'
          )}
          onClick={copyAllChanges}
        />
        <ActionButton
          icon={ClipboardPaste}
          title={translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.da953a696f',
            'Paste & Restore'
          )}
          onClick={requestRestore}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => void refreshAll()}
          aria-label={translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.a044a830f1',
            'Refresh all repositories'
          )}
          title={translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.a044a830f1',
            'Refresh all repositories'
          )}
        >
          <RefreshCw />
        </Button>
      </div>
      {hiddenNotice && (
        <div className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
          {hiddenNotice}
        </div>
      )}
      {members.some((member) => member.containsFolder) && (
        <div className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.c023ba6838',
            'This folder sits inside an imported repository, so changes outside the folder are listed too.'
          )}
        </div>
      )}
      <div
        ref={listRef}
        role="group"
        aria-label={translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.ab32287003',
          'Repositories'
        )}
        onKeyDown={onListKeyDown}
        className="max-h-[40%] shrink-0 overflow-y-auto border-b border-border py-1 scrollbar-sleek"
      >
        {members.map((member, index) => {
          const selected = member.worktree.id === selectedId
          const label = folderRepoSectionLabel(member, members)
          return (
            <div
              key={member.worktree.id}
              className={cn(
                'relative mx-1 flex items-center gap-1 rounded-md pr-1 hover:bg-accent/50 has-[[data-repo-row]:focus-visible]:ring-[3px] has-[[data-repo-row]:focus-visible]:ring-ring/50',
                selected && 'bg-accent text-accent-foreground hover:bg-accent'
              )}
            >
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
                />
              )}
              <button
                type="button"
                data-repo-row
                aria-current={selected ? 'true' : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectRepo(member.worktree.id)}
                className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs focus-visible:outline-none"
              >
                <span className="min-w-0 truncate font-medium" title={label}>
                  {label}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {changeCounts[index] ?? 0}
                </span>
              </button>
              <RepoSyncCounts worktreeId={member.worktree.id} />
              <ActionButton
                icon={Copy}
                title={translate(
                  'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.d98e7b731c',
                  'Copy all changes'
                )}
                onClick={() =>
                  void copyClipcodeGitChanges({
                    rootPath: folderPath,
                    requests: [
                      {
                        worktree: member.worktree,
                        entries:
                          useAppStore.getState().gitStatusByWorktree[member.worktree.id] ?? [],
                        forceIndexForStaged: false
                      }
                    ]
                  })
                }
              />
            </div>
          )
        })}
      </div>
      {/* Why: the selected repo is the regular full panel, so its commit dock sits at the bottom like a repo workspace. */}
      <div className="relative min-h-0 flex-1">
        <ScopedRepoPanel
          key={selectedId}
          gitWorktreeId={selectedId}
          editorWorktreeId={folderWorkspaceKey}
          label={selectedLabel}
        />
      </div>
      {restoreDialog}
    </div>
  )
}

function RepoSyncCounts({ worktreeId }: { worktreeId: string }) {
  const status = useAppStore((s) => s.remoteStatusesByWorktree[worktreeId])
  if (!status?.hasUpstream || (status.ahead === 0 && status.behind === 0)) {
    return null
  }
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
      {status.behind > 0 ? `↓${status.behind}` : ''}
      {status.ahead > 0 ? ` ↑${status.ahead}` : ''}
    </span>
  )
}

function ScopedRepoPanel({
  gitWorktreeId,
  editorWorktreeId,
  label
}: {
  gitWorktreeId: string
  editorWorktreeId: string
  label?: string
}) {
  const scope = useMemo(
    () => ({ gitWorktreeId, editorWorktreeId, label }),
    [editorWorktreeId, gitWorktreeId, label]
  )
  return (
    <SourceControlWorktreeScopeContext.Provider value={scope}>
      <SourceControlSingleRepoPanel />
    </SourceControlWorktreeScopeContext.Provider>
  )
}
