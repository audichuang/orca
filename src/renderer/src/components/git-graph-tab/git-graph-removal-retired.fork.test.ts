// Fork seam guard: upstream #41483 hides a worktree whose removal is recorded; the fork's own repo lists must too.
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { makeFolderWorkspace } from '@/store/folder-workspaces/folder-workspace.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import type { Worktree } from '../../../../shared/worktree/types'
import { listGitGraphRepoChoicesFromState } from './git-graph-tab-model'

const FOLDER_KEY = 'folder:product' as const

function seed(rows: Worktree[]): void {
  useAppStore.setState({
    repos: [{ ...TEST_REPO, id: 'app', path: '/work/product/app', kind: 'git' }],
    worktreesByRepo: { app: rows },
    folderWorkspaces: [makeFolderWorkspace({ id: 'product', folderPath: '/work/product' })]
  })
}

const main = makeWorktree({
  id: 'app-main',
  repoId: 'app',
  path: '/work/product/app',
  isMainWorktree: true,
  hostId: 'local'
})
const deleting = makeWorktree({
  id: 'app-deleting',
  repoId: 'app',
  path: '/work/product/app-deleting',
  hostId: 'local',
  removing: true,
  removalRecorded: true
})
const legacyPending = makeWorktree({
  id: 'app-legacy',
  repoId: 'app',
  path: '/work/product/app-legacy',
  hostId: 'local',
  removing: true
})

function choiceIds(workspaceKey: string): string[] {
  return listGitGraphRepoChoicesFromState(useAppStore.getState(), workspaceKey).map(
    (choice) => choice.worktree.id
  )
}

describe('Git Graph repo choices skip worktrees whose removal is recorded', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    seed([main, deleting, legacyPending])
  })

  it('in a repo workspace', () => {
    expect(choiceIds('app-main')).toEqual(['app-main', 'app-legacy'])
  })

  it('in a folder workspace that lists repo worktrees under its path', () => {
    expect(choiceIds(FOLDER_KEY)).toEqual(['app-main', 'app-legacy'])
  })
})
