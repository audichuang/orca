import { describe, expect, it, vi } from 'vitest'
import { buildMobileSessionTabSnapshots } from './sync-runtime-graph/mobile-session-snapshots'
import { createEditorTabsStore } from '../store/slices/editor-slice-test-harness'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('mobile session snapshots with a Git Graph tab', () => {
  it('never publishes the Git Graph tab as a file a phone would try to read', () => {
    const store = createEditorTabsStore()
    store.setState({
      activeWorktreeId: 'wt-api',
      repos: [
        {
          id: 'repo-api',
          path: '/work/api',
          displayName: 'api',
          badgeColor: '#000',
          addedAt: 0,
          kind: 'git'
        }
      ],
      worktreesByRepo: {
        'repo-api': [
          {
            id: 'wt-api',
            repoId: 'repo-api',
            path: '/work/api',
            head: 'abc',
            branch: 'refs/heads/main',
            isBare: false,
            isMainWorktree: true,
            displayName: 'api',
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
        ]
      }
    })
    store.getState().openFile({
      filePath: '/work/api/a.ts',
      relativePath: 'a.ts',
      worktreeId: 'wt-api',
      language: 'typescript',
      mode: 'edit'
    })
    const graphId = store.getState().openGitGraphTab('wt-api')
    expect(graphId).toBe('wt-api::git-graph')

    const snapshot = buildMobileSessionTabSnapshots(store.getState()).find(
      (entry) => entry.worktree === 'wt-api'
    )

    expect(snapshot?.tabs).toEqual([
      expect.objectContaining({ type: 'file', filePath: '/work/api/a.ts' })
    ])
    expect(JSON.stringify(snapshot)).not.toContain('::git-graph')
  })
})
