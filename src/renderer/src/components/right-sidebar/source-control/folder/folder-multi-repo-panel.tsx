import { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  buildFolderRepoListItems,
  getFolderRepoExpandedGroups,
  toggleFolderRepoGroup,
  type FolderRepoGroupId
} from './folder-repo-groups'
import { FolderRepoList } from './folder-repo-list'
import { FolderSelectedRepoHeader } from './folder-selected-repo-header'
import { filterFolderRepoIndexes, FOLDER_REPO_FILTER_MIN_REPOS } from './folder-repo-filter'
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
import {
  folderRepoSectionBranch,
  folderRepoSectionLabel,
  folderRepoSectionName
} from './folder-section-label'
import { useFolderRepoStatusRefresh } from './use-folder-repo-status-refresh'
import { useFolderRepoRowFocus } from './use-folder-repo-row-focus'
import { SourceControlWorktreeScopeContext } from './worktree-scope'

/**
 * Source Control for a folder workspace: a repo list grouped by whether a repo has changes, with the
 * selected repo's regular single-repo panel pinned below it, so staging, commit, sync and diffs behave
 * exactly as in a repo workspace.
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
  const pendingSync = useAppStore(
    useShallow((s) =>
      members.map((member) => {
        const status = s.remoteStatusesByWorktree[member.worktree.id]
        return Boolean(status?.hasUpstream && (status.ahead > 0 || status.behind > 0))
      })
    )
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
  const [filter, setFilter] = useState('')
  const showFilter = members.length >= FOLDER_REPO_FILTER_MIN_REPOS
  // Why: a query left behind when the box hides would silently narrow the list once it reappears.
  if (!showFilter && filter !== '') {
    setFilter('')
  }
  // Why: while filtering, the open repo's panel folds away so the matches sit right under the box.
  const filtering = showFilter && filter.trim() !== ''
  const expandedIndex = collapsed || filtering ? -1 : memberIds.indexOf(selectedId)
  const labels = useMemo(
    () => members.map((member) => folderRepoSectionLabel(member, members)),
    [members]
  )
  const names = useMemo(
    () => members.map((member) => folderRepoSectionName(member, members)),
    [members]
  )
  const [expandedGroups, setExpandedGroups] = useState(() =>
    getFolderRepoExpandedGroups(folderWorkspaceKey)
  )
  const toggleGroup = (group: FolderRepoGroupId) =>
    setExpandedGroups(toggleFolderRepoGroup(folderWorkspaceKey, group))
  const listItems = buildFolderRepoListItems({
    visibleIndexes: filterFolderRepoIndexes(labels, filtering ? filter : ''),
    changeCounts,
    pendingSync,
    filtering,
    expandedGroups,
    // Why the open index: a closed repo inside a folded group would read as a stray unmarked row.
    selectedIndex: expandedIndex
  })
  // Why: drawn order, so arrow keys and the focus hook's nth-row lookup agree with what is on screen.
  const visibleIds = listItems.flatMap((item) =>
    item.kind === 'repo' ? [memberIds[item.index]] : []
  )
  const { listRef, rovingId, focusRepo, keepFocusAfterToggle } = useFolderRepoRowFocus(
    visibleIds,
    selectedId
  )
  // Why: judged by what is drawn, so a match picked while filtering opens even if it was the open repo.
  const toggleRepo = (id: string) => {
    keepFocusAfterToggle(id)
    if (memberIds.indexOf(id) === expandedIndex) {
      setCollapsed(true)
      return
    }
    setFilter('')
    selectRepo(id)
    setCollapsed(false)
  }
  const selectedMember = members[memberIds.indexOf(selectedId)]
  const showDetail = selectedMember !== undefined && expandedIndex !== -1
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
    focusRepo(nextId)
  }
  const firstMatchId = visibleIds[0]

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
      name={names[index]}
      branch={folderRepoSectionBranch(member)}
      title={labels[index]}
      color={member.repo.badgeColor}
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
        workspaceKey={folderWorkspaceKey}
        selectedRepoId={selectedId}
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
          noMatch={firstMatchId === undefined}
          onFocusFirst={() => firstMatchId !== undefined && focusRepo(firstMatchId)}
          onOpenFirst={() => firstMatchId !== undefined && toggleRepo(firstMatchId)}
        />
      )}
      {/* Why: one list scroller with the open repo's full panel pinned below it, so its commit dock sits at the bottom like a repo workspace. */}
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
        <FolderRepoList
          items={listItems}
          fill={!showDetail}
          onToggleGroup={toggleGroup}
          renderRow={(index) => renderRow(members[index], index)}
        />
        {showDetail && (
          <div
            data-folder-repo-detail
            className="relative flex min-h-0 flex-1 flex-col border-t border-border"
          >
            <FolderSelectedRepoHeader
              worktreeId={selectedId}
              name={names[expandedIndex]}
              path={selectedMember.worktree.path}
              color={selectedMember.repo.badgeColor}
            />
            <div className="relative min-h-0 flex-1">
              <ScopedRepoPanel
                key={selectedId}
                gitWorktreeId={selectedId}
                editorWorktreeId={folderWorkspaceKey}
              />
            </div>
          </div>
        )}
      </div>
      {restoreDialog}
      {addReposDialog}
    </div>
  )
}

// Why no scope label: FolderSelectedRepoHeader names the repo, so the panel toolbar must not repeat it.
function ScopedRepoPanel({
  gitWorktreeId,
  editorWorktreeId
}: {
  gitWorktreeId: string
  editorWorktreeId: string
}) {
  const scope = useMemo(
    () => ({ gitWorktreeId, editorWorktreeId }),
    [editorWorktreeId, gitWorktreeId]
  )
  return (
    <SourceControlWorktreeScopeContext.Provider value={scope}>
      <SourceControlSingleRepoPanel />
    </SourceControlWorktreeScopeContext.Provider>
  )
}
