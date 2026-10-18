// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { useSourceControlWorktreeContext } from '../listing/use-worktree-context'

// Leaf stub: reports what the real scoped worktree context resolves, so the store/selector seam stays real.
vi.mock('./single-repo-panel', () => ({
  SourceControlSingleRepoPanel: () => {
    const ctx = useSourceControlWorktreeContext()
    return (
      <div data-testid="repo-panel">
        {`${ctx.activeWorktreeId}|${ctx.activeWorktree?.path ?? ''}|${ctx.editorWorktreeId}`}
      </div>
    )
  }
}))
vi.mock('../folder/use-folder-repo-status-refresh', () => ({
  useFolderRepoStatusRefresh: () => async () => {}
}))

const { SourceControlPanel } = await import('./panel')

function repo(name: string): Repo {
  return {
    id: `repo-${name}`,
    path: `/work/${name}`,
    displayName: name,
    badgeColor: '#000',
    addedAt: 0,
    kind: 'git'
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
    displayName: 'main',
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

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    folderWorkspaces: [
      {
        id: 'f1',
        projectGroupId: 'g',
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
    ],
    repos: [repo('api'), repo('core')],
    worktreesByRepo: { 'repo-api': [worktree('api')], 'repo-core': [worktree('core')] },
    gitStatusByWorktree: {
      'wt-api': [],
      'wt-core': [{ path: 'a.ts', status: 'modified', area: 'unstaged' }]
    }
  })
})
afterEach(cleanup)

describe('SourceControlPanel in a folder workspace', () => {
  it('routes a folder workspace activated through the real store action to the multi-repo panel', () => {
    // Real activation path, not a hand-set activeWorktreeId: catches upstream moving folder keys to activeWorkspaceKey only.
    act(() => {
      useAppStore.getState().setActiveWorktree(folderWorkspaceKey('f1'))
    })
    render(
      <TooltipProvider>
        <SourceControlPanel />
      </TooltipProvider>
    )
    expect(screen.getByRole('group', { name: 'Repositories' })).toBeInTheDocument()
    // The scoped context must resolve the member repo, not the active (folder) workspace.
    expect(screen.getByTestId('repo-panel')).toHaveTextContent(
      `wt-core|/work/core|${folderWorkspaceKey('f1')}`
    )
  })
})
