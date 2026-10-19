// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { GitHistoryResult } from '../../../../shared/git-history'
import { resetGitHistoryGraphFiltersForTest } from '../right-sidebar/source-control/sync/git-history-graph-filter'
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

const history = vi.fn(async (_args: { worktreePath: string; limit?: number }) => ({ ...RESULT }))
// The branch list read (limit 1) runs on mount; only the page read is gated on visibility.
const pageReads = () => history.mock.calls.filter(([args]) => args.limit === 50)

function Host({ fileId }: { fileId: string }): React.JSX.Element | null {
  const file = useAppStore((s) => s.openFiles.find((entry) => entry.id === fileId))
  return file ? <GitGraphTabView file={file} /> : null
}

beforeEach(() => {
  vi.stubGlobal('api', { git: { history } })
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
  vi.unstubAllGlobals()
  useAppStore.setState(useAppStore.getInitialState(), true)
  history.mockClear()
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
    expect(await screen.findByText('Initial commit')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('combobox', { name: 'Repository' }))
    expect(await screen.findByText('web-main')).toBeInTheDocument()
    expect(screen.queryByText('remote-main')).toBeNull()
    fireEvent.click(screen.getByText('web-main'))

    await waitFor(() =>
      expect(history).toHaveBeenLastCalledWith(
        expect.objectContaining({ worktreePath: '/work/web' })
      )
    )
    expect(useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph).toEqual({
      repoWorktreeId: 'wt-web'
    })
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
})
