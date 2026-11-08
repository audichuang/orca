import { describe, expect, it } from 'vitest'
import { buildWorkspaceSessionPayload } from './workspace-session'
import { useAppStore } from '../../../store'
import type { AppState } from '../../../store/types'

function createSnapshot(overrides: Partial<AppState> = {}): AppState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a session snapshot with only the slices the payload builder reads.
  return {
    activeRepoId: 'repo-1',
    activeWorktreeId: 'wt-1',
    activeTabId: 'tab-1',
    tabsByWorktree: {
      'wt-1': [{ id: 'tab-1', title: 'shell', ptyId: 'pty-1', worktreeId: 'wt-1' }],
      'wt-2': [{ id: 'tab-2', title: 'editor', ptyId: null, worktreeId: 'wt-2' }]
    },
    ptyIdsByTabId: {
      'tab-1': ['pty-1'],
      'tab-2': []
    },
    terminalLayoutsByTabId: {
      'tab-1': { root: null, activeLeafId: null, expandedLeafId: null }
    },
    activeTabIdByWorktree: { 'wt-1': 'tab-1', 'wt-2': 'tab-2' },
    editorDrafts: {},
    markdownFrontmatterVisible: {},
    openFiles: [
      {
        id: '/tmp/demo.ts',
        filePath: '/tmp/demo.ts',
        relativePath: 'demo.ts',
        worktreeId: 'wt-1',
        language: 'typescript',
        mode: 'edit',
        isDirty: false,
        isPreview: false,
        content: '',
        originalContent: ''
      },
      {
        id: '/tmp/demo.diff',
        filePath: '/tmp/demo.diff',
        relativePath: 'demo.diff',
        worktreeId: 'wt-1',
        language: 'diff',
        mode: 'diff',
        isDirty: false,
        isPreview: false,
        content: '',
        originalContent: ''
      }
    ],
    activeFileIdByWorktree: { 'wt-1': '/tmp/demo.ts' },
    activeTabTypeByWorktree: { 'wt-1': 'editor', 'wt-2': 'terminal' },
    browserTabsByWorktree: {
      'wt-1': [
        {
          id: 'browser-1',
          url: 'https://example.com',
          title: 'Example',
          loading: true,
          canGoBack: false,
          canGoForward: false,
          errorCode: null,
          errorDescription: null
        }
      ]
    },
    activeBrowserTabIdByWorktree: { 'wt-1': 'browser-1' },
    lastKnownRelayPtyIdByTabId: {},
    sshConnectionStates: new Map(),
    repos: [],
    worktreesByRepo: {},
    browserPagesByWorkspace: {
      'browser-1': [
        {
          id: 'page-1',
          workspaceId: 'browser-1',
          worktreeId: 'wt-1',
          url: 'https://example.com',
          title: 'Example',
          loading: true,
          faviconUrl: null,
          canGoBack: false,
          canGoForward: false,
          loadError: null,
          createdAt: 1_700_000_000_000
        }
      ]
    },
    browserUrlHistory: [],
    remoteBrowserPageHandlesByPageId: {},
    ...overrides
  } as AppState
}

describe('buildWorkspaceSessionPayload for a scoped tab git owner', () => {
  it('persists the git owner of a scoped edit tab only when it differs from the tab owner', () => {
    const file = (id: string, gitWorktreeId: string) => ({
      id,
      filePath: id,
      relativePath: 'a.ts',
      worktreeId: 'wt-1',
      gitWorktreeId,
      language: 'typescript',
      mode: 'edit' as const,
      isDirty: false,
      content: '',
      originalContent: ''
    })
    const payload = buildWorkspaceSessionPayload(
      createSnapshot({ openFiles: [file('/f/a/a.ts', 'repo-a'), file('/f/b.ts', 'wt-1')] })
    )
    const saved = payload.openFilesByWorktree?.['wt-1']
    expect(saved?.[0]?.gitWorktreeId).toBe('repo-a')
    expect(saved?.[1]?.gitWorktreeId).toBeUndefined()
  })
})

describe('a folder edit tab bound to a repo across save and restore', () => {
  it('saves and restores the folder-relative path with its git owner', () => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: open and hydrate read only the folder and repo catalogs.
      {
        repos: [{ id: 'repo-a', path: '/repo-a', displayName: 'a', badgeColor: '', addedAt: 0 }],
        worktreesByRepo: {
          'repo-a': [{ id: 'repo-a::/repo-a', repoId: 'repo-a', path: '/repo-a' }]
        },
        folderWorkspaces: [{ id: 'pkg', folderPath: '/repo-a/pkg', projectGroupId: 'g1' }]
      } as unknown as Partial<AppState>
    )
    useAppStore.getState().openFile(
      {
        filePath: '/repo-a/pkg/a.md',
        relativePath: 'a.md',
        worktreeId: 'folder:pkg',
        runtimeEnvironmentId: null,
        language: 'markdown',
        mode: 'edit'
      },
      { suppressActiveRuntimeFallback: true }
    )
    const payload = buildWorkspaceSessionPayload(
      createSnapshot({ openFiles: useAppStore.getState().openFiles })
    )
    expect(payload.openFilesByWorktree?.['folder:pkg']?.[0]).toMatchObject({
      relativePath: 'a.md',
      gitWorktreeId: 'repo-a::/repo-a'
    })

    useAppStore.setState({ openFiles: [] })
    useAppStore.getState().hydrateEditorSession(payload)

    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({
        worktreeId: 'folder:pkg',
        relativePath: 'a.md',
        gitWorktreeId: 'repo-a::/repo-a'
      })
    ])
  })
})
