import { describe, expect, it } from 'vitest'
import { makeFolderWorkspace } from '@/store/folder-workspaces/folder-workspace.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import type { Repo } from '../../../../../../shared/repo-types'
import { withFolderPathRepoOwners } from './folder-path-repo-owners'

const repo = (id: string, path: string): Repo => ({
  id,
  path,
  displayName: id,
  badgeColor: '#000',
  addedAt: 0
})
const INSIDE = repo('inside', '/work/folder/inside')
const OUTSIDE = repo('outside', '/work/other')
const insideWt = makeWorktree({
  id: 'inside::/work/folder/inside',
  repoId: 'inside',
  path: INSIDE.path
})
const outsideWt = makeWorktree({
  id: 'outside::/work/other',
  repoId: 'outside',
  path: OUTSIDE.path
})
const folder = makeFolderWorkspace({ id: 'f', folderPath: '/work/folder' })
const worktreesByRepo = { inside: [insideWt], outside: [outsideWt] }

describe('withFolderPathRepoOwners', () => {
  it('adds the registered repos under the folder path that upstream did not attach', () => {
    const owners = withFolderPathRepoOwners(
      { folderWorkspace: folder, owners: [] },
      worktreesByRepo,
      [INSIDE, OUTSIDE]
    )
    expect(owners).toEqual([
      {
        worktreeId: 'inside::/work/folder/inside',
        repoId: 'inside',
        executionHostId: 'local',
        worktree: insideWt,
        attachedAt: 0
      }
    ])
  })

  it('keeps an attached worktree once, in upstream order', () => {
    const attached = {
      worktreeId: insideWt.id,
      repoId: 'inside',
      executionHostId: 'local' as const,
      worktree: insideWt,
      attachedAt: 5
    }
    const owners = withFolderPathRepoOwners(
      { folderWorkspace: folder, owners: [attached] },
      worktreesByRepo,
      [INSIDE, OUTSIDE]
    )
    expect(owners).toEqual([attached])
  })
})
