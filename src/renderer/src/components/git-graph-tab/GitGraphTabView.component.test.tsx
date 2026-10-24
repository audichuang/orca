// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { GitHistoryResult } from '../../../../shared/git-history'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { NestedRepoScanResult } from '../../../../shared/project-group-types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  getGitHistoryGraphDraftQuery,
  getGitHistoryGraphFilter,
  gitGraphTabFilterKey,
  resetGitHistoryGraphFiltersForTest,
  setGitHistoryGraphDraftQuery,
  updateGitHistoryGraphFilter
} from '../right-sidebar/source-control/sync/git-history-graph-filter'
import { showGitGraphPathHistory } from '../right-sidebar/source-control/sync/git-history-graph-path-query'
import { peekGitGraphRevealRequest } from './git-graph-reveal-request'
import { resetGitGraphRememberedSelectionForTest } from '../right-sidebar/source-control/sync/use-git-graph-full-view-state'
import {
  getRememberedFolderRepo,
  rememberFolderRepo
} from '../right-sidebar/source-control/folder/folder-repo-selection'
import GitGraphTabView from './GitGraphTabView'
import { pickFolderRepo, showCommitInGitGraphSlot } from './git-graph-source-control-link'
import { GitHistoryPanel } from '../right-sidebar/source-control/sync/git-history-panel'

type ToastOptions = { action?: { label: string; onClick: () => void } }
const toastInfo = vi.hoisted(() => vi.fn<(message: string, options?: ToastOptions) => void>())
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    info: toastInfo,
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  })
}))

function repo(name: string, extra: Partial<Repo> = {}): Repo {
  return {
    id: `repo-${name}`,
    path: `/work/${name}`,
    displayName: name,
    badgeColor: '#000',
    addedAt: 0,
    kind: 'git',
    ...extra
  }
}

function worktree(name: string): Worktree {
  return {
    id: `wt-${name}`,
    repoId: `repo-${name}`,
    path: `/work/${name}`,
    head: 'abc',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: true,
    displayName: `${name}-main`,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

const RESULT: GitHistoryResult = {
  items: [
    {
      id: 'a'.repeat(40),
      displayId: 'aaaaaaa',
      parentIds: [],
      subject: 'Initial commit',
      message: 'Initial commit',
      timestamp: 1
    }
  ],
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: false,
  limit: 50
}

type HistoryArgs = { worktreePath: string; limit?: number; graph?: Record<string, unknown> }
const history = vi.fn(async (_args: HistoryArgs): Promise<GitHistoryResult> => ({ ...RESULT }))
// The branch list read (limit 1) runs on mount; only the page read is gated on visibility.
const pageReads = () => history.mock.calls.filter(([args]) => args.limit === 50)

const scanNested = vi.fn(async (_args: { path: string }): Promise<NestedRepoScanResult> => ({
  selectedPath: '/work',
  selectedPathKind: 'non_git_folder',
  repos: [
    { path: '/work/api', displayName: 'api', depth: 1 },
    { path: '/work/not-added', displayName: 'not-added', depth: 1 },
    { path: '/work/docs/specs', displayName: 'specs', depth: 2 }
  ],
  truncated: false,
  timedOut: false,
  stopped: false,
  durationMs: 1,
  maxDepth: 4,
  maxRepos: 200,
  timeoutMs: null
}))

function folder(extra: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'folder-1',
    projectGroupId: 'group-1',
    name: 'work',
    folderPath: '/work',
    connectionId: null,
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra
  }
}

function Host({ fileId }: { fileId: string }): React.JSX.Element | null {
  const file = useAppStore((s) => s.openFiles.find((entry) => entry.id === fileId))
  return file ? <GitGraphTabView file={file} /> : null
}

beforeEach(() => {
  vi.stubGlobal('api', { git: { history }, projectGroups: { scanNested } })
  useAppStore.setState({
    activeView: 'terminal',
    activeWorktreeId: 'wt-api',
    // The ssh repo shares no filesystem with the local workspace, so it is never offered.
    repos: [repo('api'), repo('web'), repo('remote', { connectionId: 'ssh-1' })],
    worktreesByRepo: {
      'repo-api': [worktree('api')],
      'repo-web': [worktree('web')],
      'repo-remote': [worktree('remote')]
    }
  })
})

afterEach(() => {
  cleanup()
  resetGitHistoryGraphFiltersForTest()
  resetGitGraphRememberedSelectionForTest()
  vi.unstubAllGlobals()
  useAppStore.setState(useAppStore.getInitialState(), true)
  history.mockReset()
  history.mockImplementation(async () => ({ ...RESULT }))
  scanNested.mockClear()
  toastInfo.mockClear()
})

describe('Git Graph tab', () => {
  it("loads the workspace repo's history, then the repo picked in the switcher", async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    render(
      <TooltipProvider>
        <Host fileId={id} />
      </TooltipProvider>
    )
    await waitFor(() =>
      expect(history).toHaveBeenCalledWith(expect.objectContaining({ worktreePath: '/work/api' }))
    )
    expect(await screen.findByTestId('git-graph-full-row')).toHaveTextContent('Initial commit')

    // The switcher leads the toolbar, names the repo and branch, and the repo colour tops the tab.
    const repoSwitcher = screen.getByRole('combobox', { name: 'Repository' })
    expect(repoSwitcher).toHaveTextContent('apimain')
    expect(
      repoSwitcher.compareDocumentPosition(screen.getByRole('combobox', { name: 'Branch filter' }))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(
      document.querySelector<HTMLElement>('[data-git-graph-accent]')?.style.backgroundColor
    ).toMatch(/^(#000000|rgb\(0, 0, 0\))$/)

    fireEvent.click(repoSwitcher)
    expect(await screen.findByText('web-main')).toBeInTheDocument()
    expect(screen.queryByText('remote-main')).toBeNull()
    fireEvent.click(screen.getByText('web-main'))

    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ worktreePath: '/work/web' })
      )
    )
    expect(useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph).toMatchObject(
      {
        repoWorktreeId: 'wt-web'
      }
    )
  })

  it('does not fetch while its workspace is in the background', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    useAppStore.setState({ activeWorktreeId: 'wt-web' })
    render(
      <TooltipProvider>
        <Host fileId={id} />
      </TooltipProvider>
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pageReads()).toEqual([])

    useAppStore.setState({ activeWorktreeId: 'wt-api' })
    await waitFor(() => expect(pageReads()).toHaveLength(1))
  })

  it('refetches when the repo head or upstream counts move, like the sidebar after a commit or push', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    render(
      <TooltipProvider>
        <Host fileId={id} />
      </TooltipProvider>
    )
    await waitFor(() => expect(pageReads()).toHaveLength(1))

    useAppStore.setState((s) => ({
      worktreesByRepo: { ...s.worktreesByRepo, 'repo-api': [{ ...worktree('api'), head: 'def' }] }
    }))
    await waitFor(() => expect(pageReads()).toHaveLength(2))

    useAppStore.setState({
      remoteStatusesByWorktree: { 'wt-api': { hasUpstream: true, ahead: 0, behind: 2 } }
    })
    await waitFor(() => expect(pageReads()).toHaveLength(3))
  })

  it('asks for a repository when the chosen one is gone but others remain', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api', { repoWorktreeId: 'wt-web' })!
    useAppStore.setState((s) => ({ worktreesByRepo: { ...s.worktreesByRepo, 'repo-web': [] } }))
    render(
      <TooltipProvider>
        <Host fileId={id} />
      </TooltipProvider>
    )
    expect(await screen.findByRole('combobox', { name: 'Repository' })).toHaveTextContent(
      'Select repository'
    )
    expect(screen.queryByText('No Git repository is available for this workspace.')).toBeNull()
  })
  it("offers the folder's not-added repos from the switcher, counted once the menu opens", async () => {
    useAppStore.setState({ folderWorkspaces: [folder()] })
    const id = useAppStore.getState().openGitGraphTab(folderWorkspaceKey('folder-1'))!
    render(
      <TooltipProvider>
        <Host fileId={id} />
      </TooltipProvider>
    )
    const trigger = await screen.findByRole('combobox', { name: 'Repository' })
    expect(scanNested).not.toHaveBeenCalled()

    fireEvent.click(trigger)
    // /work/api is added, so not-added and docs/specs are the two left.
    expect(await screen.findByText('2 not added')).toBeInTheDocument()
    const entry = screen.getByText('Add repositories...')
    expect(scanNested).toHaveBeenCalledWith(expect.objectContaining({ path: '/work' }))

    fireEvent.click(entry)
    expect(await screen.findByRole('dialog')).toHaveTextContent('docs/specs')
  })

  it('offers adding repos when the last added repo under a local folder is gone', async () => {
    useAppStore.setState({ folderWorkspaces: [folder()] })
    const id = useAppStore.getState().openGitGraphTab(folderWorkspaceKey('folder-1'))!
    useAppStore.setState({ worktreesByRepo: {} })
    render(
      <TooltipProvider>
        <Host fileId={id} />
      </TooltipProvider>
    )
    expect(
      await screen.findByText('No Git repository is available for this workspace.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add repositories in this folder' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('not-added')
  })

  it('keeps the add entry out of SSH folders, whose add path is local only', async () => {
    useAppStore.setState({
      folderWorkspaces: [folder({ folderPath: '/work', connectionId: 'ssh-1' })]
    })
    const id = useAppStore.getState().openGitGraphTab(folderWorkspaceKey('folder-1'))!
    render(
      <TooltipProvider>
        <Host fileId={id} />
      </TooltipProvider>
    )
    fireEvent.click(await screen.findByRole('combobox', { name: 'Repository' }))
    expect(await screen.findByText('remote-main')).toBeInTheDocument()
    expect(screen.queryByText('Add repositories...')).toBeNull()
    expect(scanNested).not.toHaveBeenCalled()
  })
})

function renderTab(id: string): void {
  render(
    <TooltipProvider>
      <Host fileId={id} />
    </TooltipProvider>
  )
}

// The graph's own focused row; sidebar Commits rows carry data-commit-id too.
const graphFocusedCommit = (): string | null =>
  document.activeElement?.closest('[data-git-graph-root]')
    ? document.activeElement.getAttribute('data-commit-id')
    : null

const lastPageGraph = (): Record<string, unknown> | undefined => pageReads().at(-1)?.[0].graph
const savedFilter = (id: string): unknown =>
  useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph?.filter

describe('Git Graph tab filters', () => {
  it('opens on all branches without touching the sidebar Commits filter', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    await waitFor(() =>
      expect(lastPageGraph()).toMatchObject({
        mode: 'all',
        source: { local: true, remotes: 'all' }
      })
    )
    expect(getGitHistoryGraphFilter('wt-api').scope).toBe('head')

    act(() => updateGitHistoryGraphFilter(gitGraphTabFilterKey(id, 'wt-api'), { query: 'fix' }))
    await waitFor(() => expect(lastPageGraph()).toMatchObject({ search: { text: 'fix' } }))
    expect(getGitHistoryGraphFilter('wt-api').query).toBe('')

    const reads = pageReads().length
    act(() => updateGitHistoryGraphFilter('wt-api', { query: 'sidebar only' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(pageReads()).toHaveLength(reads)
  })

  it('saves the filter on the tab and restores it on a fresh mount', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    act(() =>
      updateGitHistoryGraphFilter(gitGraphTabFilterKey(id, 'wt-api'), { query: 'fix', limit: 300 })
    )
    await waitFor(() =>
      expect(savedFilter(id)).toEqual({
        scope: 'all',
        refs: [],
        local: true,
        remotes: 'all',
        query: 'fix'
      })
    )
    cleanup()
    // A fresh renderer: nothing in memory, only what the tab saved.
    resetGitHistoryGraphFiltersForTest()
    history.mockClear()
    useAppStore.setState((s) => ({
      openFiles: s.openFiles.map((file) =>
        file.id === id
          ? {
              ...file,
              gitGraph: {
                repoWorktreeId: 'wt-api',
                filter: { scope: 'head', refs: [], local: true, remotes: [], query: 'fix' }
              }
            }
          : file
      )
    }))
    renderTab(id)
    await waitFor(() => expect(pageReads()).toHaveLength(1))
    expect(lastPageGraph()).toEqual({
      mode: 'head',
      search: { text: 'fix' },
      listTags: true,
      limit: 50
    })
  })

  it('saves the Tags source on the tab and walks tags again on a fresh mount', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    act(() => updateGitHistoryGraphFilter(gitGraphTabFilterKey(id, 'wt-api'), { tags: true }))
    await waitFor(() => expect(savedFilter(id)).toMatchObject({ scope: 'all', tags: true }))
    const saved = useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph?.filter
    cleanup()
    resetGitHistoryGraphFiltersForTest()
    history.mockClear()
    useAppStore.setState((s) => ({
      openFiles: s.openFiles.map((file) =>
        file.id === id
          ? {
              ...file,
              gitGraph: { repoWorktreeId: 'wt-api', filter: saved }
            }
          : file
      )
    }))
    renderTab(id)
    await waitFor(() => expect(pageReads()).toHaveLength(1))
    expect(lastPageGraph()).toMatchObject({ source: { tags: true } })
  })

  it('carries scope and search to another repo but drops its branch picks', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    act(() =>
      updateGitHistoryGraphFilter(gitGraphTabFilterKey(id, 'wt-api'), {
        scope: 'refs',
        refs: ['refs/heads/api-only'],
        query: 'fix'
      })
    )
    await waitFor(() => expect(savedFilter(id)).toMatchObject({ refs: ['refs/heads/api-only'] }))

    act(() => useAppStore.getState().setGitGraphTabRepo(id, 'wt-web'))
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ worktreePath: '/work/web' })
      )
    )
    expect(lastPageGraph()).toMatchObject({ mode: 'all', search: { text: 'fix' } })
    expect(lastPageGraph()).not.toHaveProperty('refs')
    expect(savedFilter(id)).toMatchObject({ scope: 'all', refs: [], query: 'fix' })
  })

  it("restores the tab's current filter, not an old in-memory one, on returning to a repo", async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    const apiKey = gitGraphTabFilterKey(id, 'wt-api')
    renderTab(id)
    act(() => {
      updateGitHistoryGraphFilter(apiKey, { scope: 'refs', refs: ['refs/heads/old'], query: 'a' })
      setGitHistoryGraphDraftQuery(apiKey, 'a draft')
    })
    await waitFor(() => expect(savedFilter(id)).toMatchObject({ query: 'a' }))

    act(() => useAppStore.getState().setGitGraphTabRepo(id, 'wt-web'))
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ worktreePath: '/work/web' })
      )
    )
    act(() => updateGitHistoryGraphFilter(gitGraphTabFilterKey(id, 'wt-web'), { query: 'b' }))
    await waitFor(() => expect(savedFilter(id)).toMatchObject({ query: 'b' }))

    act(() => useAppStore.getState().setGitGraphTabRepo(id, 'wt-api'))
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ worktreePath: '/work/api' })
      )
    )
    expect(lastPageGraph()).toMatchObject({ mode: 'all', search: { text: 'b' } })
    expect(savedFilter(id)).toMatchObject({ scope: 'all', refs: [], query: 'b' })
    expect(getGitHistoryGraphDraftQuery(apiKey)).toBe('b')
  })

  it('keeps a Show File History path filter when it switches the open tab to another repo', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    await waitFor(() => expect(savedFilter(id)).toBeDefined())

    act(() =>
      showGitGraphPathHistory({
        workspaceId: 'wt-api',
        repoWorktreeId: 'wt-web',
        path: 'src/a.ts',
        openGitGraphTab: useAppStore.getState().openGitGraphTab
      })
    )
    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ worktreePath: '/work/web' })
      )
    )
    expect(lastPageGraph()).toMatchObject({ search: { path: 'src/a.ts' } })
    expect(savedFilter(id)).toMatchObject({ query: 'path:src/a.ts' })
  })

  it('offers Clear filters and Show all branches when the filter matches nothing', async () => {
    history.mockImplementation(async () => ({ ...RESULT, items: [] }))
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    const key = gitGraphTabFilterKey(id, 'wt-api')
    renderTab(id)
    act(() => updateGitHistoryGraphFilter(key, { scope: 'refs', refs: ['refs/heads/gone'] }))
    expect(await screen.findByText('No commits match this filter')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show all branches' }))
    expect(getGitHistoryGraphFilter(key)).toMatchObject({ scope: 'all', refs: [], remotes: 'all' })

    act(() => updateGitHistoryGraphFilter(key, { query: 'zzz' }))
    expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show all branches' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(getGitHistoryGraphFilter(key)).toMatchObject({ scope: 'all', query: '' })
  })

  it('does not offer filter actions for a repo with no commits', async () => {
    history.mockImplementation(async () => ({ ...RESULT, items: [] }))
    renderTab(useAppStore.getState().openGitGraphTab('wt-api')!)
    expect(await screen.findByText('No commits yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })
})

describe('Git Graph tab first selection', () => {
  const OLDER = { ...RESULT.items[0]!, id: 'b'.repeat(40), subject: 'Older', message: 'Older' }
  const NEWER = { ...RESULT.items[0]!, id: 'c'.repeat(40), subject: 'Elsewhere', message: 'x' }
  const HEAD = {
    ...RESULT.items[0]!,
    id: 'd'.repeat(40),
    subject: 'Head commit',
    message: 'Head commit',
    references: [{ id: 'refs/heads/main', name: 'main', category: 'branches' as const }]
  }
  const withHead = (): GitHistoryResult => ({
    ...RESULT,
    items: [NEWER, HEAD, OLDER],
    currentRef: { id: 'refs/heads/main', name: 'main', revision: HEAD.id }
  })
  const selectedSubjects = (): string[] =>
    screen
      .getAllByTestId('git-graph-full-row')
      .filter((row) => row.getAttribute('data-selected') === 'true')
      .map((row) => row.textContent ?? '')

  it('selects the checked-out commit once, then leaves the selection to the user', async () => {
    history.mockImplementation(async () => withHead())
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    await waitFor(() =>
      expect(selectedSubjects()).toEqual([expect.stringContaining('Head commit')])
    )

    fireEvent.click(screen.getByText('Older'))
    expect(selectedSubjects()).toEqual([expect.stringContaining('Older')])
    // A refresh brings a new result; the user's pick stays.
    useAppStore.setState((s) => ({
      worktreesByRepo: { ...s.worktreesByRepo, 'repo-api': [{ ...worktree('api'), head: 'def' }] }
    }))
    await waitFor(() => expect(pageReads()).toHaveLength(2))
    expect(selectedSubjects()).toEqual([expect.stringContaining('Older')])
  })

  it('falls back to the first commit when HEAD is not in the list', async () => {
    history.mockImplementation(async () => ({ ...withHead(), items: [NEWER, OLDER] }))
    renderTab(useAppStore.getState().openGitGraphTab('wt-api')!)
    await waitFor(() => expect(selectedSubjects()).toEqual([expect.stringContaining('Elsewhere')]))
  })

  it("starts a reopened tab on the checked-out commit, not the closed tab's pick", async () => {
    history.mockImplementation(async () => withHead())
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    await waitFor(() =>
      expect(selectedSubjects()).toEqual([expect.stringContaining('Head commit')])
    )
    fireEvent.click(screen.getByText('Older'))
    act(() => useAppStore.getState().closeFile(id))
    expect(screen.queryByTestId('git-graph-full-row')).toBeNull()

    act(() => {
      // Closing the last tab clears the active workspace in this bare store; the app restores it.
      useAppStore.setState({ activeWorktreeId: 'wt-api' })
      useAppStore.getState().openGitGraphTab('wt-api')
    })
    await waitFor(() =>
      expect(selectedSubjects()).toEqual([expect.stringContaining('Head commit')])
    )
  })

  it('keeps the pick on returning to a tab that stayed open', async () => {
    history.mockImplementation(async () => withHead())
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    renderTab(id)
    await waitFor(() =>
      expect(selectedSubjects()).toEqual([expect.stringContaining('Head commit')])
    )
    fireEvent.click(screen.getByText('Older'))
    // Another editor tab took the view: the graph unmounts but its tab is still open.
    cleanup()
    renderTab(id)
    await waitFor(() => expect(screen.getAllByTestId('git-graph-full-row')).toHaveLength(3))
    expect(selectedSubjects()).toEqual([expect.stringContaining('Older')])
  })

  it('selects a revealed commit over the checked-out one', async () => {
    history.mockImplementation(async () => withHead())
    renderTab(useAppStore.getState().openGitGraphTab('wt-api', { revealCommit: OLDER.id })!)
    await waitFor(() => expect(selectedSubjects()).toEqual([expect.stringContaining('Older')]))
  })

  it('reveals a commit in a tab that is already showing the repo', async () => {
    history.mockImplementation(async () => withHead())
    renderTab(useAppStore.getState().openGitGraphTab('wt-api')!)
    await waitFor(() =>
      expect(selectedSubjects()).toEqual([expect.stringContaining('Head commit')])
    )
    act(() => {
      useAppStore.getState().openGitGraphTab('wt-api', { revealCommit: NEWER.id })
    })
    await waitFor(() => expect(selectedSubjects()).toEqual([expect.stringContaining('Elsewhere')]))
  })

  it('keeps the usual first pick when the revealed commit is not loaded', async () => {
    history.mockImplementation(async () => withHead())
    const id = useAppStore.getState().openGitGraphTab('wt-api', { revealCommit: 'e'.repeat(40) })!
    renderTab(id)
    await waitFor(() =>
      expect(selectedSubjects()).toEqual([expect.stringContaining('Head commit')])
    )
    expect(toastInfo.mock.calls.at(-1)?.[0]).toBe('That commit is not in the loaded history.')
    expect(peekGitGraphRevealRequest(id)).toBeNull()
  })

  it('selects the detached checked-out commit by its revision', async () => {
    history.mockImplementation(async () => ({
      ...RESULT,
      items: [NEWER, OLDER],
      currentRef: { id: OLDER.id, name: 'bbbbbbb', revision: OLDER.id, category: 'commits' }
    }))
    renderTab(useAppStore.getState().openGitGraphTab('wt-api')!)
    await waitFor(() => expect(selectedSubjects()).toEqual([expect.stringContaining('Older')]))
  })

  it('loads deeper history to find a revealed commit past the first page', async () => {
    const DEEP = { ...RESULT.items[0]!, id: 'f'.repeat(40), subject: 'Deep', message: 'Deep' }
    history.mockImplementation(async (args) =>
      args.graph?.limit === 1000
        ? { ...withHead(), items: [NEWER, HEAD, OLDER, DEEP], hasMore: false }
        : { ...withHead(), hasMore: true }
    )
    const id = useAppStore.getState().openGitGraphTab('wt-api', { revealCommit: DEEP.id })!
    renderTab(id)
    await waitFor(() => expect(selectedSubjects()).toEqual([expect.stringContaining('Deep')]))
    expect(toastInfo).not.toHaveBeenCalled()
    expect(peekGitGraphRevealRequest(id)).toBeNull()
  })

  it('offers to clear filters when a filtered graph hides the revealed commit', async () => {
    history.mockImplementation(async (args) => (args.graph?.search ? { ...RESULT } : withHead()))
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    const key = gitGraphTabFilterKey(id, 'wt-api')
    renderTab(id)
    act(() => updateGitHistoryGraphFilter(key, { query: 'fix' }))
    await waitFor(() => expect(lastPageGraph()).toMatchObject({ search: { text: 'fix' } }))
    await waitFor(() => expect(screen.getAllByTestId('git-graph-full-row')).toHaveLength(1))

    act(() => {
      useAppStore.getState().openGitGraphTab('wt-api', { revealCommit: OLDER.id })
    })
    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith(
        'That commit is not in the loaded history.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Clear filters' }) })
      )
    )
    act(() => toastInfo.mock.calls.at(-1)?.[1]?.action?.onClick())
    expect(getGitHistoryGraphFilter(key).query).toBe('')
    await waitFor(() => expect(selectedSubjects()).toEqual([expect.stringContaining('Older')]))
  })
})

describe('Git Graph tab and Source Control', () => {
  it("selects the switched-to repo in the folder's Source Control", async () => {
    useAppStore.setState({ folderWorkspaces: [folder()] })
    const key = folderWorkspaceKey('folder-1')
    renderTab(useAppStore.getState().openGitGraphTab(key, { repoWorktreeId: 'wt-api' })!)
    fireEvent.click(await screen.findByRole('combobox', { name: 'Repository' }))
    fireEvent.click(await screen.findByText('web-main'))
    expect(getRememberedFolderRepo(key)).toBe('wt-web')
  })

  it("leaves keyboard focus in Source Control's repo list when the tab follows its pick", async () => {
    const key = folderWorkspaceKey('folder-1')
    useAppStore.setState({ folderWorkspaces: [folder()], activeWorktreeId: key })
    const id = useAppStore.getState().openGitGraphTab(key, { repoWorktreeId: 'wt-api' })!
    render(
      <TooltipProvider>
        <button type="button">repo list</button>
        <Host fileId={id} />
      </TooltipProvider>
    )
    // Opening the tab is the gesture that lands focus on its commit list.
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-commit-id')).toBe(RESULT.items[0]!.id)
    )
    const repoList = screen.getByRole('button', { name: 'repo list' })
    act(() => repoList.focus())

    act(() => pickFolderRepo(key, 'wt-web'))
    await waitFor(() =>
      expect(pageReads().at(-1)?.[0]).toMatchObject({ worktreePath: '/work/web' })
    )
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Repository' })).toHaveTextContent('web')
    )
    await screen.findByTestId('git-graph-full-row')
    await act(async () => {})
    expect(repoList).toHaveFocus()
  })

  it('moves keyboard focus to the commit list when opened while already in front', async () => {
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    render(
      <TooltipProvider>
        <button type="button">sidebar</button>
        <Host fileId={id} />
      </TooltipProvider>
    )
    await waitFor(() => expect(graphFocusedCommit()).toBe(RESULT.items[0]!.id))
    const sidebar = screen.getByRole('button', { name: 'sidebar' })
    act(() => sidebar.focus())

    act(() => {
      useAppStore.getState().openGitGraphTab('wt-api')
    })
    await waitFor(() => expect(graphFocusedCommit()).toBe(RESULT.items[0]!.id))
  })

  it('ends Show in Git Graph with focus on the revealed graph row, after the menu restores it', async () => {
    const older = { ...RESULT.items[0]!, id: 'b'.repeat(40), subject: 'Older', message: 'Older' }
    history.mockImplementation(async () => ({ ...RESULT, items: [RESULT.items[0]!, older] }))
    const id = useAppStore.getState().openGitGraphTab('wt-api')!
    render(
      <TooltipProvider>
        <GitHistoryPanel
          state={{ status: 'ready', result: { ...RESULT, items: [RESULT.items[0]!, older] } }}
          collapsed={false}
          onToggle={vi.fn()}
          onRefresh={vi.fn()}
          onOpenCommit={vi.fn()}
          onCommitAction={vi.fn()}
          onShowCommitInGraph={showCommitInGitGraphSlot('wt-api', 'wt-api')}
        />
        <Host fileId={id} />
      </TooltipProvider>
    )
    await waitFor(() => expect(graphFocusedCommit()).toBe(RESULT.items[0]!.id))
    const sidebarRow = screen
      .getAllByTestId('git-history-row')
      .find((row) => row.textContent?.includes('Older'))!
    act(() => sidebarRow.focus())

    fireEvent.contextMenu(sidebarRow)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Show in Git Graph' }))
    // Radix restores focus to the menu's trigger in a timeout after the menu unmounts.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    await waitFor(() => expect(graphFocusedCommit()).toBe(older.id))
    // In the app the restore waits out the menu's exit animation, so it can land later still.
    act(() => sidebarRow.focus())
    expect(graphFocusedCommit()).toBe(older.id)
  })

  it('opens Source Control on the shown repo', async () => {
    useAppStore.setState({ folderWorkspaces: [folder()], rightSidebarOpen: false })
    const key = folderWorkspaceKey('folder-1')
    renderTab(useAppStore.getState().openGitGraphTab(key, { repoWorktreeId: 'wt-web' })!)
    // Source Control moved on meanwhile; the button brings it back to the graph's repo.
    act(() => rememberFolderRepo(key, 'wt-api'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open in Source Control' }))
    const state = useAppStore.getState()
    expect(state.rightSidebarOpen).toBe(true)
    expect(state.rightSidebarTab).toBe('source-control')
    expect(getRememberedFolderRepo(key)).toBe('wt-web')
  })
})
