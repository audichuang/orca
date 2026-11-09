import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { makeFolderWorkspace } from '@/store/folder-workspaces/folder-workspace.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import type { WorkspaceLineage } from '../../../../shared/worktree/lineage-types'
import { worktreeWorkspaceKey } from '../../../../shared/workspace-scope'
import { listGitGraphRepoChoicesFromState } from './git-graph-tab-model'

const FOLDER_KEY = 'folder:attached' as const

function seed(withInside: boolean): void {
  const folder = makeFolderWorkspace({ id: 'attached', folderPath: '/work/folder' })
  const outside = makeWorktree({
    id: 'outside',
    repoId: 'outside',
    path: '/elsewhere/repo',
    hostId: 'local'
  })
  const inside = makeWorktree({
    id: 'inside',
    repoId: 'inside',
    path: '/work/folder/inside',
    hostId: 'local'
  })
  const rows = withInside ? [outside, inside] : [outside]
  const lineage: WorkspaceLineage = {
    childWorkspaceKey: worktreeWorkspaceKey(outside.id),
    parentWorkspaceKey: FOLDER_KEY,
    origin: 'cli',
    capture: { source: 'env-workspace', confidence: 'inferred' },
    createdAt: 1
  }
  useAppStore.setState({
    repos: rows.map((row) => ({ ...TEST_REPO, id: row.repoId, path: row.path, kind: 'git' })),
    worktreesByRepo: Object.fromEntries(rows.map((row) => [row.repoId, [row]])),
    folderWorkspaces: [folder],
    workspaceLineageByChildKey: { [lineage.childWorkspaceKey]: lineage },
    activeWorktreeId: FOLDER_KEY,
    activeWorkspaceKey: FOLDER_KEY,
    activeWorkspaceExecutionHostId: 'local'
  })
}

describe('Git Graph on a folder with an upstream attached worktree outside its path', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))

  it.each([false, true])(
    'lists and opens the attached repo (repo inside the folder too: %s)',
    (withInside) => {
      seed(withInside)
      const ids = listGitGraphRepoChoicesFromState(useAppStore.getState(), FOLDER_KEY).map(
        (choice) => choice.worktree.id
      )
      expect(ids).toEqual(withInside ? ['inside', 'outside'] : ['outside'])
      const tabId = useAppStore
        .getState()
        .openGitGraphTab(FOLDER_KEY, { repoWorktreeId: 'outside', revealCommit: 'a'.repeat(40) })
      const tab = useAppStore.getState().openFiles.find((file) => file.id === tabId)
      expect(tab?.gitGraph?.repoWorktreeId).toBe('outside')
    }
  )
})
