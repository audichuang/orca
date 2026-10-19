import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from './editor-slice-test-harness'
import type { AppState } from '../types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { rememberFolderRepo } from '@/components/right-sidebar/source-control/folder/folder-repo-selection'

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
