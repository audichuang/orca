import { describe, expect, it } from 'vitest'
import { buildWorkspaceSessionPayload } from './workspace-session'
import type { AppState } from '../store'

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
          createdAt: Date.now()
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
