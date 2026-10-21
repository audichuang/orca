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
  getGitHistoryGraphFilter,
  gitGraphTabFilterKey,
  resetGitHistoryGraphFiltersForTest,
  updateGitHistoryGraphFilter
} from '../right-sidebar/source-control/sync/git-history-graph-filter'
import { resetGitGraphRememberedSelectionForTest } from '../right-sidebar/source-control/sync/use-git-graph-full-view-state'
import GitGraphTabView from './GitGraphTabView'

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
    expect(lastPageGraph()).toEqual({ mode: 'head', search: { text: 'fix' }, limit: 50 })
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
})
