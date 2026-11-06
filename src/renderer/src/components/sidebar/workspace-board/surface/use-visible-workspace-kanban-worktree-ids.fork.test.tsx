// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  resetFolderSidebarHiddenReposForTest,
  setReposHiddenFromSidebar
} from '../../../right-sidebar/source-control/folder/folder-sidebar-hidden-repos'
import { useVisibleWorkspaceKanbanWorktreeIds } from './use-visible-workspace-kanban-worktree-ids'

const REPO: Repo = {
  id: 'repo-a',
  path: '/work/folder/repo-a',
  displayName: 'repo-a',
  badgeColor: '',
  addedAt: 0
}
const WORKTREE: Worktree = {
  id: 'repo-a::/work/folder/repo-a',
  repoId: REPO.id,
  path: REPO.path,
  head: 'abc123',
  branch: 'refs/heads/main',
  isBare: false,
  isMainWorktree: true,
  displayName: 'repo-a',
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

beforeEach(() => {
  localStorage.clear()
  resetFolderSidebarHiddenReposForTest()
  useAppStore.setState({
    repos: [REPO],
    worktreesByRepo: { [REPO.id]: [WORKTREE] },
    showSleepingWorkspaces: true,
    filterRepoIds: []
  })
})

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

// Why stable: a fresh array/Map per render would recompute the memo and hide a missing dep.
const ALL_WORKTREES = [WORKTREE]
const REPO_MAP = new Map([[REPO.id, REPO]])

it('drops a repo from the board when it is hidden from the sidebar while the board is open', () => {
  const { result } = renderHook(() =>
    useVisibleWorkspaceKanbanWorktreeIds({ allWorktrees: ALL_WORKTREES, repoMap: REPO_MAP })
  )
  expect(result.current.size).toBe(1)

  act(() => setReposHiddenFromSidebar([REPO], true))

  expect(result.current.size).toBe(0)
})
