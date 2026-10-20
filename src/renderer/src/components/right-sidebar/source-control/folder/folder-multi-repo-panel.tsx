import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useAllWorktrees, useRepoMap } from '@/store/selectors'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID
} from '../../../../../../shared/execution-host'
import { copyClipcodeGitChanges } from '../clipcode/clipcode-copy-action'
import { useClipcodeRestore } from '../clipcode/use-clipcode-restore'
import { SourceControlSingleRepoPanel } from '../panel/single-repo-panel'
import {
  countHiddenFolderWorktrees,
  getFolderGitWorktrees,
  type FolderGitWorktree
} from './folder-git-worktrees'
import { FolderAddReposDialog } from './folder-add-repos-dialog'
import { FolderRepoFilterBox } from './folder-repo-filter-box'
import { FolderRepoPanelToolbar } from './folder-repo-panel-toolbar'
import { FolderRepoRow } from './folder-repo-row'
import { FOLDER_REPO_FILTER_MIN_REPOS, getFolderRepoFilterView } from './folder-repo-filter'
import {
  isRepoHiddenFromSidebar,
  setReposHiddenFromSidebar,
  useFolderSidebarHiddenReposVersion
} from './folder-sidebar-hidden-repos'
import {
  getRememberedFolderRepo,
  isFolderRepoListCollapsed,
  moveRepoSelection,
  rememberFolderRepo,
  rememberFolderRepoListCollapsed,
  resolveFolderDefaultRepo,
  resolveSelectedRepoId,
  isFolderRepoSelectionKey
} from './folder-repo-selection'
import { folderRepoSectionLabel } from './folder-section-label'
import { useFolderRepoStatusRefresh } from './use-folder-repo-status-refresh'
import { SourceControlWorktreeScopeContext } from './worktree-scope'

/**
 * Source Control for a folder workspace: an accordion of repo headers where the open repo shows its
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
  useFolderSidebarHiddenReposVersion()
  const [addReposOpen, setAddReposOpen] = useState(false)
  // Why local only: adding a project from here goes through the local add path; SSH and server folders keep the hint.
  const canAddRepos =
    folderWorkspace !== null && getRepoExecutionHostId(folderWorkspace) === LOCAL_EXECUTION_HOST_ID
  const addReposDialog =
    addReposOpen && folderWorkspace ? (
      <FolderAddReposDialog
        folderWorkspace={folderWorkspace}
        onClose={() => setAddReposOpen(false)}
      />
    ) : null
  const isVisible = useAppStore((s) => s.rightSidebarOpen && s.rightSidebarTab === 'source-control')
  const refreshAll = useFolderRepoStatusRefresh(memberWorktrees, isVisible)
  const changeCounts = useAppStore(
    useShallow((s) => members.map((member) => s.gitStatusByWorktree[member.worktree.id]?.length))
  )
  const [chosenId, setChosenId] = useState<string | null>(() =>
    getRememberedFolderRepo(folderWorkspaceKey)
  )
  const [defaultId, setDefaultId] = useState<string | null>(null)
  const memberIds = members.map((member) => member.worktree.id)
  const landingId = resolveFolderDefaultRepo(memberIds, changeCounts)
  // Why: freeze the landing repo once known, so later count changes (a commit, a poll) never move the selection.
  useEffect(() => {
    if (defaultId === null && landingId !== null) {
      setDefaultId(landingId)
    }
  }, [defaultId, landingId])
  const selectedId = resolveSelectedRepoId({
    chosenId,
    defaultId,
    ids: memberIds,
    firstDirtyId: landingId ?? undefined
  })
  const [collapsed, setCollapsedState] = useState(() =>
    isFolderRepoListCollapsed(folderWorkspaceKey)
  )
  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedState(next)
      rememberFolderRepoListCollapsed(folderWorkspaceKey, next)
    },
    [folderWorkspaceKey]
  )
  const selectRepo = useCallback(
    (id: string) => {
      setChosenId(id)
      rememberFolderRepo(folderWorkspaceKey, id)
    },
    [folderWorkspaceKey]
  )
  const expandedIndex = collapsed ? -1 : memberIds.indexOf(selectedId)
  const [filter, setFilter] = useState('')
  const showFilter = members.length >= FOLDER_REPO_FILTER_MIN_REPOS
  const labels = useMemo(
    () => members.map((member) => folderRepoSectionLabel(member, members)),
    [members]
  )
  const { matchIndexes, visibleIndexes } = getFolderRepoFilterView(
    labels,
    showFilter ? filter : '',
    expandedIndex
  )
  const visibleIds = visibleIndexes.map((index) => memberIds[index])
  const listRef = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const rovingId =
    focusId !== null && visibleIds.includes(focusId)
      ? focusId
      : visibleIds.includes(selectedId)
        ? selectedId
        : visibleIds[0]
  const pendingFocusRef = useRef<string | null>(null)
  const focusRow = useCallback(
    (id: string) => {
      listRef.current
        ?.querySelectorAll<HTMLElement>('[data-repo-row]')
        [visibleIds.indexOf(id)]?.focus()
    },
    [visibleIds]
  )
  // Why: opening a repo moves headers between the above/below-panel lists, which remounts them and drops focus.
  useLayoutEffect(() => {
    if (pendingFocusRef.current !== null) {
      focusRow(pendingFocusRef.current)
      pendingFocusRef.current = null
    }
  })
  const toggleRepo = (id: string) => {
    pendingFocusRef.current = id
    setFocusId(id)
    if (id === selectedId && !collapsed) {
      setCollapsed(true)
      return
    }
    selectRepo(id)
    setCollapsed(false)
  }
  const selectedMember = members.find((member) => member.worktree.id === selectedId)
  const selectedLabel = selectedMember ? folderRepoSectionLabel(selectedMember, members) : undefined
  // Accordion keys: arrows/Home/End move focus between headers; Enter/Space opens or closes one.
  const onListKeyDown = (event: React.KeyboardEvent) => {
    // Why: only the repo rows navigate; arrow keys on a row's Copy button must not move focus.
    if (
      !isFolderRepoSelectionKey(event.key) ||
      !(event.target instanceof HTMLElement) ||
      !event.target.hasAttribute('data-repo-row')
    ) {
      return
    }
    const nextId = moveRepoSelection(visibleIds, rovingId, event.key)
    if (nextId === undefined) {
      return
    }
    event.preventDefault()
    setFocusId(nextId)
    focusRow(nextId)
  }
  const firstMatchId = matchIndexes.length > 0 ? memberIds[matchIndexes[0]] : undefined
  const focusRepo = (id: string) => {
    setFocusId(id)
    focusRow(id)
  }
  // Why: unlike toggleRepo, opening from the filter never collapses an already-open repo.
  const openRepo = (id: string) => {
    pendingFocusRef.current = id
    setFocusId(id)
    selectRepo(id)
    setCollapsed(false)
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
  const renderRow = (member: FolderGitWorktree, index: number) => (
    <FolderRepoRow
      key={member.worktree.id}
      worktreeId={member.worktree.id}
      label={labels[index]}
      changeCount={changeCounts[index] ?? 0}
      focusable={member.worktree.id === rovingId}
      expanded={index === expandedIndex}
      onToggle={() => toggleRepo(member.worktree.id)}
      // Why main worktree only: the choice covers the whole repo, so a linked worktree's row would hide its siblings too.
      sidebarHidden={
        member.containsFolder || !member.worktree.isMainWorktree
          ? undefined
          : isRepoHiddenFromSidebar(member.repo)
      }
      onToggleSidebarHidden={() =>
        setReposHiddenFromSidebar([member.repo], !isRepoHiddenFromSidebar(member.repo))
      }
      onCopy={() =>
        void copyClipcodeGitChanges({
          rootPath: folderPath,
          requests: [
            {
              worktree: member.worktree,
              entries: useAppStore.getState().gitStatusByWorktree[member.worktree.id] ?? [],
              forceIndexForStaged: false
            }
          ]
        })
      }
    />
  )

  if (!folderWorkspace) {
    return null
  }
  if (members.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.4c62351467',
          'No imported Git repositories under this folder. Add the repositories inside it to Orca to see their changes here.'
        )}
        {canAddRepos && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAddReposOpen(true)}>
            <FolderPlus />
            {translate(
              'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.addRepos',
              'Add repositories in this folder'
            )}
          </Button>
        )}
        {addReposDialog}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FolderRepoPanelToolbar
        name={folderWorkspace.name}
        folderPath={folderWorkspace.folderPath}
        onCopyAll={copyAllChanges}
        onAddRepos={canAddRepos ? () => setAddReposOpen(true) : undefined}
        onRestore={requestRestore}
        onRefresh={() => void refreshAll()}
      />
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
      {showFilter && (
        <FolderRepoFilterBox
          value={filter}
          onChange={setFilter}
          noMatch={matchIndexes.length === 0}
          onFocusFirst={() => firstMatchId !== undefined && focusRepo(firstMatchId)}
          onOpenFirst={() => firstMatchId !== undefined && openRepo(firstMatchId)}
        />
      )}
      {/* Why: one repo open at a time; its regular full panel fills the height between the headers, so its commit dock sits at the bottom like a repo workspace. */}
      <div
        ref={listRef}
        role="group"
        aria-label={translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.ab32287003',
          'Repositories'
        )}
        onKeyDown={onListKeyDown}
        className="flex min-h-0 flex-1 flex-col"
      >
        {expandedIndex === -1 ? (
          <div className="min-h-0 flex-1 overflow-y-auto py-1 scrollbar-sleek">
            {visibleIndexes.map((index) => renderRow(members[index], index))}
          </div>
        ) : (
          <>
            <div className="max-h-[40%] shrink-0 overflow-y-auto pt-1 scrollbar-sleek">
              {visibleIndexes
                .filter((index) => index <= expandedIndex)
                .map((index) => renderRow(members[index], index))}
            </div>
            <div className="relative mt-1 min-h-0 flex-1 border-y border-border">
              <ScopedRepoPanel
                key={selectedId}
                gitWorktreeId={selectedId}
                editorWorktreeId={folderWorkspaceKey}
                label={selectedLabel}
              />
            </div>
            {visibleIndexes.some((index) => index > expandedIndex) && (
              <div className="max-h-[30%] shrink-0 overflow-y-auto py-1 scrollbar-sleek">
                {visibleIndexes
                  .filter((index) => index > expandedIndex)
                  .map((index) => renderRow(members[index], index))}
              </div>
            )}
          </>
        )}
      </div>
      {restoreDialog}
      {addReposDialog}
    </div>
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
