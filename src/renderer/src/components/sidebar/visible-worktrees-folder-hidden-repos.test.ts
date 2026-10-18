// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { computeVisibleWorktreeIds } from './compute-visible-worktrees'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import {
  resetFolderSidebarHiddenReposForTest,
  setReposHiddenFromSidebar
} from '../right-sidebar/source-control/folder/folder-sidebar-hidden-repos'

function makeRepo(id: string, path: string): Repo {
  return { id, path, displayName: id, badgeColor: '', addedAt: 0 }
}

function makeWorktree(id: string, repoId: string): Worktree {
  return {
    id,
    repoId,
    path: `/tmp/${id}`,
    head: 'abc123',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: true,
    displayName: id,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

const etf = makeRepo('etf', '/work/cat/docs/etf')
const bfs = makeRepo('bfs', '/work/cat/bfs')

function visibleIds(): string[] {
  return computeVisibleWorktreeIds(
    { etf: [makeWorktree('etf-main', 'etf')], bfs: [makeWorktree('bfs-main', 'bfs')] },
    ['etf-main', 'bfs-main'],
    {
      filterRepoIds: [],
      showSleepingWorkspaces: true,
      tabsByWorktree: {},
      ptyIdsByTabId: {},
      browserTabsByWorktree: {},
      worktreeIdsWithLiveAgent: new Set(),
      hideDefaultBranchWorkspace: false,
      hideAutomationGeneratedWorkspaces: false,
      hideCliCreatedWorkspaces: false,
      hideDetachedHeadWorkspaces: false,
      hideWorkspacesFromOtherDevices: false,
      pairedDeviceIdsByEnvironment: new Map(),
      repoMap: new Map([
        ['etf', etf],
        ['bfs', bfs]
      ]),
      workspaceHostScope: 'all',
      defaultHostId: LOCAL_EXECUTION_HOST_ID,
      worktreeLineageById: {}
    }
  )
}

beforeEach(() => {
  localStorage.clear()
  resetFolderSidebarHiddenReposForTest()
})

// Why: guards the fork seam in computeVisibleWorktrees, which every sidebar ordering (cards, Cmd+1–9, kanban) shares.
describe('computeVisibleWorktrees with folder-only repos', () => {
  it('drops the worktrees of repos kept in their folder only', () => {
    setReposHiddenFromSidebar([etf], true)

    expect(visibleIds()).toEqual(['bfs-main'])
  })

  it('shows them again once the repo is put back in the sidebar', () => {
    setReposHiddenFromSidebar([etf], true)
    setReposHiddenFromSidebar([etf], false)

    expect(visibleIds()).toEqual(['etf-main', 'bfs-main'])
  })
})
