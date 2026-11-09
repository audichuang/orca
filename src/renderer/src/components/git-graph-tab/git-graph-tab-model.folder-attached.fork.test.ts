import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { makeFolderWorkspace } from '@/store/folder-workspaces/folder-workspace.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import type { WorkspaceLineage } from '../../../../shared/worktree/lineage-types'
import { worktreeWorkspaceKey } from '../../../../shared/workspace-scope'
import type { Repo } from '../../../../shared/repo-types'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import {
  listGitGraphRepoChoicesFromInputs,
  listGitGraphRepoChoicesFromState,
  type GitGraphChoiceInputs
} from './git-graph-tab-model'

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
      expect(ids).toEqual(withInside ? ['outside', 'inside'] : ['outside'])
      const tabId = useAppStore
        .getState()
        .openGitGraphTab(FOLDER_KEY, { repoWorktreeId: 'outside', revealCommit: 'a'.repeat(40) })
      const tab = useAppStore.getState().openFiles.find((file) => file.id === tabId)
      expect(tab?.gitGraph?.repoWorktreeId).toBe('outside')
    }
  )
})

describe('Git Graph folder choices follow upstream folder Source Control owners', () => {
  const folder = makeFolderWorkspace({ id: 'attached', folderPath: '/work/folder' })
  const inputs = (overrides: Partial<GitGraphChoiceInputs>): GitGraphChoiceInputs => ({
    repos: [],
    repoWorktrees: {},
    folders: [folder],
    workspaceLineageByChildKey: {},
    worktreeLineageById: {},
    lineageParentIdentities: undefined,
    crossStoreChildrenByFolderId: new Map(),
    ...overrides
  })

  it('lists remote lineage children the folder Source Control resolves from other stores', () => {
    const root = makeWorktree({
      id: 'remote-root',
      repoId: 'remote',
      path: '/srv/remote-root',
      hostId: 'ssh:box',
      instanceId: 'root'
    })
    const child = makeWorktree({
      id: 'remote-child',
      repoId: 'remote',
      path: '/srv/remote-child',
      hostId: 'ssh:box',
      instanceId: 'child'
    })
    const remoteRepo: Repo = {
      ...TEST_REPO,
      id: 'remote',
      path: '/srv/remote-root',
      kind: 'git',
      connectionId: 'box'
    }
    const ids = listGitGraphRepoChoicesFromInputs(
      inputs({
        repos: [remoteRepo],
        repoWorktrees: { remote: [root, child] },
        lineageParentIdentities: new Map([
          ['ssh:box|remote-root', 'local|folder:attached'],
          ['ssh:box|remote-child', 'ssh:box|remote-root']
        ]),
        crossStoreChildrenByFolderId: new Map([['attached', [root]]])
      }),
      FOLDER_KEY
    ).map((choice) => choice.worktree.id)
    expect(ids.toSorted()).toEqual(['remote-child', 'remote-root'])
  })

  it('pairs an attached local worktree with the local repo when a remote repo shares its id', () => {
    const local = makeWorktree({
      id: 'shared-wt',
      repoId: 'shared',
      path: '/elsewhere/shared',
      hostId: 'local'
    })
    const localRepo: Repo = { ...TEST_REPO, id: 'shared', path: '/elsewhere/shared', kind: 'git' }
    const remoteRepo: Repo = { ...localRepo, executionHostId: 'runtime:remote' }
    const lineage: WorkspaceLineage = {
      childWorkspaceKey: worktreeWorkspaceKey(local.id),
      parentWorkspaceKey: FOLDER_KEY,
      origin: 'cli',
      capture: { source: 'env-workspace', confidence: 'inferred' },
      createdAt: 1
    }
    for (const repos of [
      [localRepo, remoteRepo],
      [remoteRepo, localRepo]
    ]) {
      const choices = listGitGraphRepoChoicesFromInputs(
        inputs({
          repos,
          repoWorktrees: { shared: [local] },
          workspaceLineageByChildKey: { [lineage.childWorkspaceKey]: lineage }
        }),
        FOLDER_KEY
      )
      expect(
        choices.map((choice) => [choice.worktree.id, getRepoExecutionHostId(choice.repo)])
      ).toEqual([['shared-wt', 'local']])
    }
  })
})
