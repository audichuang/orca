import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from './editor-slice-test-harness'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  getRememberedFolderRepo,
  rememberFolderRepo
} from '@/components/right-sidebar/source-control/folder/folder-repo-selection'
import {
  peekGitGraphRevealRequest,
  requestGitGraphReveal
} from '@/components/git-graph-tab/git-graph-reveal-request'
import {
  getGitHistoryGraphDraftQuery,
  getGitHistoryGraphFilter,
  gitGraphTabFilterKey,
  setGitHistoryGraphDraftQuery,
  updateGitHistoryGraphFilter
} from '@/components/right-sidebar/source-control/sync/git-history-graph-filter'
import {
  collectGitHistoryAuthors,
  listRecentGitHistoryGraphPaths,
  rememberGitHistoryGraphPath
} from '@/components/right-sidebar/source-control/sync/git-history-graph-query-tokens'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

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

function worktree(name: string, repoName = name): Worktree {
  return {
    id: `wt-${name}`,
    repoId: `repo-${repoName}`,
    path: `/work/${name}`,
    head: 'abc',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: name === repoName,
    displayName: name,
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

function seededStore(): ReturnType<typeof createEditorTabsStore> {
  const store = createEditorTabsStore()
  store.setState({
    activeWorktreeId: 'wt-api',
    repos: [repo('api'), repo('web'), repo('notes', { kind: 'folder' })],
    worktreesByRepo: {
      'repo-api': [worktree('api'), worktree('api-feature', 'api')],
      'repo-web': [worktree('web')],
      'repo-notes': [worktree('notes')]
    },
    folderWorkspaces: [
      {
        id: 'f1',
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
        updatedAt: 0
      }
    ]
  })
  return store
}

const gitGraphFiles = (store: ReturnType<typeof createEditorTabsStore>) =>
  store.getState().openFiles.filter((file) => file.mode === 'git-graph')

describe('Git Graph editor tab', () => {
  it("opens one transient tab on the workspace's own repo", () => {
    const store = seededStore()
    const id = store.getState().openGitGraphTab('wt-api')

    expect(id).toBe('wt-api::git-graph')
    expect(gitGraphFiles(store)).toEqual([
      expect.objectContaining({
        id,
        worktreeId: 'wt-api',
        relativePath: 'Git Graph',
        gitGraph: { repoWorktreeId: 'wt-api' }
      })
    ])
    expect(store.getState().unifiedTabsByWorktree['wt-api']).toEqual([
      expect.objectContaining({ entityId: id, contentType: 'git-graph' })
    ])
    expect(store.getState().activeFileId).toBe(id)
  })

  it('focuses the existing tab instead of adding another, and keeps its repo', () => {
    const store = seededStore()
    store.getState().openGitGraphTab('wt-api', { repoWorktreeId: 'wt-web' })
    store.getState().openFile({
      filePath: '/work/api/a.ts',
      relativePath: 'a.ts',
      worktreeId: 'wt-api',
      language: 'typescript',
      mode: 'edit'
    })
    expect(store.getState().activeFileId).not.toBe('wt-api::git-graph')

    store.getState().openGitGraphTab('wt-api')

    expect(gitGraphFiles(store)).toHaveLength(1)
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-web' })
    const tabs = store.getState().unifiedTabsByWorktree['wt-api'] ?? []
    expect(tabs.filter((tab) => tab.contentType === 'git-graph')).toHaveLength(1)
    expect(store.getState().activeFileId).toBe('wt-api::git-graph')
    const graphTab = tabs.find((tab) => tab.contentType === 'git-graph')
    const group = store
      .getState()
      .groupsByWorktree['wt-api']?.find((g) => g.id === graphTab?.groupId)
    expect(group?.activeTabId).toBe(graphTab?.id)
  })

  it('switches the repo of an open tab, from the entry point or the switcher', () => {
    const store = seededStore()
    const id = store.getState().openGitGraphTab('wt-api')!
    store.getState().openGitGraphTab('wt-api', { repoWorktreeId: 'wt-api-feature' })
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-api-feature' })

    store.getState().setGitGraphTabRepo(id, 'wt-web')
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-web' })
  })

  it('defaults a folder workspace to its remembered member repo, else the first', () => {
    const store = seededStore()
    store.setState({ activeWorktreeId: 'folder:f1' })

    store.getState().openGitGraphTab('folder:f1')
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-api' })
    store.getState().closeFile('folder:f1::git-graph')

    rememberFolderRepo('folder:f1', 'wt-web')
    store.getState().openGitGraphTab('folder:f1')
    expect(gitGraphFiles(store)[0]).toEqual(
      expect.objectContaining({ worktreeId: 'folder:f1', gitGraph: { repoWorktreeId: 'wt-web' } })
    )
  })

  it("mirrors a folder tab's repo switch into the folder's Source Control pick", () => {
    const store = seededStore()
    const id = store.getState().openGitGraphTab('folder:f1', { repoWorktreeId: 'wt-api' })!
    store.getState().setGitGraphTabRepo(id, 'wt-api-feature')
    expect(getRememberedFolderRepo('folder:f1')).toBe('wt-api-feature')
  })

  it('keeps a reveal request off the persisted tab state', () => {
    const store = seededStore()
    const id = store.getState().openGitGraphTab('wt-api', { revealCommit: 'c'.repeat(40) })!
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-api' })
    expect(peekGitGraphRevealRequest(id)).toMatchObject({
      repoWorktreeId: 'wt-api',
      commitId: 'c'.repeat(40)
    })
  })

  it("records a folder tab's resolved repo as the folder's Source Control pick", () => {
    const store = seededStore()
    store.getState().openGitGraphTab('folder:f1', { repoWorktreeId: 'wt-web' })
    expect(getRememberedFolderRepo('folder:f1')).toBe('wt-web')
  })

  it('saves a filter passed on open as the tab filter', () => {
    const store = seededStore()
    const filter = { scope: 'all' as const, refs: [], local: true, remotes: [], query: 'path:a' }
    store.getState().openGitGraphTab('wt-api', { repoWorktreeId: 'wt-web', filter })
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-web', filter })
  })

  it('drops a pending reveal for another repo when the tab switches repo', () => {
    const store = seededStore()
    const id = store.getState().openGitGraphTab('wt-api', { revealCommit: 'c'.repeat(40) })!
    store.getState().setGitGraphTabRepo(id, 'wt-web')
    expect(peekGitGraphRevealRequest(id)).toBeNull()
  })

  it("forgets the tab's in-memory filter state when it closes", () => {
    const store = seededStore()
    const id = store.getState().openGitGraphTab('wt-api')!
    const key = gitGraphTabFilterKey(id, 'wt-api')
    updateGitHistoryGraphFilter(key, { query: 'fix' })
    setGitHistoryGraphDraftQuery(key, 'fix more')
    rememberGitHistoryGraphPath(key, 'src/a.ts')
    collectGitHistoryAuthors(key, [
      { id: 'x', parentIds: [], subject: 's', message: 's', author: 'Ada' }
    ])
    requestGitGraphReveal(id, 'wt-api', 'c'.repeat(40))
    updateGitHistoryGraphFilter('wt-api', { query: 'sidebar' })

    store.getState().closeFile(id)

    expect(getGitHistoryGraphFilter(key).query).toBe('')
    expect(getGitHistoryGraphDraftQuery(key)).toBe('')
    expect(listRecentGitHistoryGraphPaths(key)).toEqual([])
    expect(collectGitHistoryAuthors(key, [])).toEqual([])
    expect(peekGitGraphRevealRequest(id)).toBeNull()
    expect(getGitHistoryGraphFilter('wt-api').query).toBe('sidebar')
  })

  it('opens nothing for a workspace without a git repo', () => {
    const store = seededStore()
    expect(store.getState().openGitGraphTab('wt-notes')).toBeNull()
    expect(gitGraphFiles(store)).toEqual([])
  })

  it('reopens a closed Git Graph tab as a Git Graph tab', () => {
    const store = seededStore()
    const id = store.getState().openGitGraphTab('wt-api', { repoWorktreeId: 'wt-web' })!
    store.getState().closeFile(id)
    expect(gitGraphFiles(store)).toEqual([])

    store.getState().reopenClosedEditorTab('wt-api')

    expect(gitGraphFiles(store)).toEqual([
      expect.objectContaining({ id, gitGraph: { repoWorktreeId: 'wt-web' } })
    ])
    expect(store.getState().unifiedTabsByWorktree['wt-api']).toEqual([
      expect.objectContaining({ entityId: id, contentType: 'git-graph' })
    ])
  })

  it('falls back to the default repo once the remembered one is gone', () => {
    const store = seededStore()
    store.getState().openGitGraphTab('wt-api', { repoWorktreeId: 'wt-web' })
    store.setState((s) => ({ worktreesByRepo: { ...s.worktreesByRepo, 'repo-web': [] } }))

    store.getState().openGitGraphTab('wt-api')
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-api' })

    store.getState().openGitGraphTab('wt-api', { repoWorktreeId: 'wt-web' })
    expect(gitGraphFiles(store)[0]?.gitGraph).toEqual({ repoWorktreeId: 'wt-api' })
  })

  it('reopens onto the same tab while a remote runtime is active', () => {
    const store = seededStore()
    store.setState({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: openFile reads only activeRuntimeEnvironmentId from settings here.
      settings: { activeRuntimeEnvironmentId: 'env-remote' } as AppState['settings']
    })
    const id = store.getState().openGitGraphTab('wt-api')!
    store.getState().closeFile(id)
    store.getState().openGitGraphTab('wt-api')

    store.getState().reopenClosedEditorTab('wt-api')

    expect(gitGraphFiles(store).map((file) => file.id)).toEqual([id])
    const tabs = store.getState().unifiedTabsByWorktree['wt-api'] ?? []
    expect(tabs.filter((tab) => tab.contentType === 'git-graph')).toHaveLength(1)
  })
})
