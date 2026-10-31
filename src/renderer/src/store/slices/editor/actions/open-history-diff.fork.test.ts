import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  FOLDER,
  REPO,
  ROOT,
  seedFolderGitOwner
} from '@/components/editor/folder-git-owner.test-fixture'

beforeEach(seedFolderGitOwner)

it.each(['branch', 'commit'] as const)(
  'stamps the %s diff with the repo runtime when the folder has no runtime owner',
  (mode) => {
    useAppStore.setState({ folderWorkspaces: [] })
    const state = useAppStore.getState()
    const entry = { path: 'src/a.ts', status: 'modified' as const }
    if (mode === 'branch') {
      state.openBranchDiff(
        FOLDER,
        ROOT,
        entry,
        {
          baseRef: 'main',
          baseOid: 'a'.repeat(40),
          headOid: 'b'.repeat(40),
          mergeBase: 'a'.repeat(40),
          compareRef: 'HEAD'
        },
        'typescript',
        { gitWorktreeId: REPO }
      )
    } else {
      state.openCommitDiff(
        FOLDER,
        ROOT,
        entry,
        {
          baseRef: 'HEAD^',
          compareRef: 'HEAD',
          commitOid: 'b'.repeat(40),
          parentOid: 'a'.repeat(40)
        },
        'typescript',
        { gitWorktreeId: REPO }
      )
    }
    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({
        worktreeId: FOLDER,
        gitWorktreeId: REPO,
        runtimeEnvironmentId: 'server'
      })
    ])
  }
)
