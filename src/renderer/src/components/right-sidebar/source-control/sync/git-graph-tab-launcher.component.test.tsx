// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { GitGraphTabLauncher } from './git-graph-tab-launcher'
import { GitHistoryPanel } from './git-history-panel'

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('Commits header Git Graph button', () => {
  it('sits beside the Commits toggle while collapsed; clicking it opens the tab without expanding', () => {
    const onToggle = vi.fn()
    const openGitGraphTab = vi.fn()
    useAppStore.setState({ openGitGraphTab })
    render(
      <TooltipProvider>
        <GitHistoryPanel
          state={{ status: 'idle' }}
          collapsed
          onToggle={onToggle}
          onRefresh={vi.fn()}
          headerActions={<GitGraphTabLauncher workspaceId="wt-web" repoWorktreeId="wt-web" />}
          toolbar={<div>toolbar</div>}
        />
      </TooltipProvider>
    )
    expect(screen.queryByText('toolbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    expect(onToggle).not.toHaveBeenCalled()
    expect(openGitGraphTab).toHaveBeenCalledWith('wt-web', { repoWorktreeId: 'wt-web' })
  })

  it("opens the folder workspace's Git Graph tab on the sidebar's repo", () => {
    useAppStore.setState({
      activeWorktreeId: 'folder:f1',
      repos: [
        { id: 'repo-web', path: '/work/web', displayName: 'web', badgeColor: '#000', addedAt: 0 }
      ],
      worktreesByRepo: {
        'repo-web': [
          {
            id: 'wt-web',
            repoId: 'repo-web',
            path: '/work/web',
            head: 'abc',
            branch: 'refs/heads/main',
            isBare: false,
            isMainWorktree: true,
            displayName: 'web',
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
    render(
      <TooltipProvider>
        <GitGraphTabLauncher workspaceId="folder:f1" repoWorktreeId="wt-web" />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    expect(useAppStore.getState().openFiles).toContainEqual(
      expect.objectContaining({
        id: 'folder:f1::git-graph',
        worktreeId: 'folder:f1',
        mode: 'git-graph',
        gitGraph: { repoWorktreeId: 'wt-web' }
      })
    )
  })
})
