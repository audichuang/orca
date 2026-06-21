import { describe, expect, it } from 'vitest'
import {
  selectPendingDeletionsForEnvironment,
  collectTombstonedGroupIds,
  filterGroupsByPendingDeletions,
  applyPendingDeletionsToRepos,
  filterFolderWorkspacesByPendingDeletions
} from './pending-project-group-deletions'
import type { PendingProjectGroupDeletion } from './types'
import type { ProjectGroup, Repo, FolderWorkspace } from './types'

function makeGroup(overrides: Partial<ProjectGroup> = {}): ProjectGroup {
  return {
    id: 'group-1',
    name: 'Platform',
    parentPath: '/workspace/platform',
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/workspace/platform/api',
    displayName: 'api',
    badgeColor: 'gray',
    addedAt: 1,
    projectGroupId: 'group-1',
    ...overrides
  }
}

function makeWorkspace(overrides: Partial<FolderWorkspace> = {}): FolderWorkspace {
  return {
    id: 'ws-1',
    projectGroupId: 'group-1',
    name: 'Platform WS',
    folderPath: '/workspace/platform',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function makeTombstone(
  overrides: Partial<PendingProjectGroupDeletion> = {}
): PendingProjectGroupDeletion {
  return {
    environmentId: 'env-1',
    groupId: 'group-1',
    removeContainedProjects: false,
    pendingProjectIds: [],
    subtreeGroupIds: ['group-1'],
    createdAt: 1000,
    ...overrides
  }
}

describe('selectPendingDeletionsForEnvironment', () => {
  it('returns only tombstones for the given environment', () => {
    const tombstones = [
      makeTombstone({ environmentId: 'env-1', groupId: 'group-1' }),
      makeTombstone({ environmentId: 'env-2', groupId: 'group-2' }),
      makeTombstone({ environmentId: 'env-1', groupId: 'group-3' })
    ]
    const result = selectPendingDeletionsForEnvironment(tombstones, 'env-1')
    expect(result).toHaveLength(2)
    expect(result.map((t) => t.groupId)).toEqual(['group-1', 'group-3'])
  })

  it('returns empty array when no tombstones match', () => {
    const tombstones = [makeTombstone({ environmentId: 'env-2' })]
    expect(selectPendingDeletionsForEnvironment(tombstones, 'env-1')).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(selectPendingDeletionsForEnvironment([], 'env-1')).toEqual([])
  })
})

describe('collectTombstonedGroupIds', () => {
  it('collects root groupId from subtreeGroupIds when groups is empty', () => {
    const tombstones = [makeTombstone({ subtreeGroupIds: ['group-1', 'group-child-1'] })]
    const result = collectTombstonedGroupIds([], tombstones, 'env-1')
    expect(result).toEqual(new Set(['group-1', 'group-child-1']))
  })

  it('unions subtreeGroupIds snapshot with live subtree when groups are present', () => {
    const groups = [
      makeGroup({ id: 'group-1', parentGroupId: null }),
      makeGroup({ id: 'group-child-1', parentGroupId: 'group-1' }),
      makeGroup({ id: 'group-child-2', parentGroupId: 'group-1' })
    ]
    // snapshot only knows group-child-1 but live graph also has group-child-2
    const tombstones = [
      makeTombstone({
        groupId: 'group-1',
        subtreeGroupIds: ['group-1', 'group-child-1']
      })
    ]
    const result = collectTombstonedGroupIds(groups, tombstones, 'env-1')
    expect(result).toEqual(new Set(['group-1', 'group-child-1', 'group-child-2']))
  })

  it('handles nested child groups (grandchildren)', () => {
    const groups = [
      makeGroup({ id: 'root', parentGroupId: null }),
      makeGroup({ id: 'child', parentGroupId: 'root' }),
      makeGroup({ id: 'grandchild', parentGroupId: 'child' })
    ]
    const tombstones = [makeTombstone({ groupId: 'root', subtreeGroupIds: ['root'] })]
    const result = collectTombstonedGroupIds(groups, tombstones, 'env-1')
    expect(result).toEqual(new Set(['root', 'child', 'grandchild']))
  })

  it('ignores tombstones for different environments', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const tombstones = [
      makeTombstone({ environmentId: 'env-2', groupId: 'group-1', subtreeGroupIds: ['group-1'] })
    ]
    const result = collectTombstonedGroupIds(groups, tombstones, 'env-1')
    expect(result.size).toBe(0)
  })

  it('unions across multiple tombstones for the same environment', () => {
    const groups = [
      makeGroup({ id: 'group-a', parentGroupId: null }),
      makeGroup({ id: 'group-b', parentGroupId: null })
    ]
    const tombstones = [
      makeTombstone({ environmentId: 'env-1', groupId: 'group-a', subtreeGroupIds: ['group-a'] }),
      makeTombstone({ environmentId: 'env-1', groupId: 'group-b', subtreeGroupIds: ['group-b'] })
    ]
    const result = collectTombstonedGroupIds(groups, tombstones, 'env-1')
    expect(result).toEqual(new Set(['group-a', 'group-b']))
  })

  it('returns empty set when no tombstones exist', () => {
    const groups = [makeGroup()]
    expect(collectTombstonedGroupIds(groups, [], 'env-1').size).toBe(0)
  })
})

describe('filterGroupsByPendingDeletions', () => {
  it('removes groups in the tombstoned subtree', () => {
    const groups = [
      makeGroup({ id: 'group-1', parentGroupId: null }),
      makeGroup({ id: 'group-child', parentGroupId: 'group-1' }),
      makeGroup({ id: 'group-sibling', parentGroupId: null })
    ]
    const tombstones = [
      makeTombstone({ groupId: 'group-1', subtreeGroupIds: ['group-1', 'group-child'] })
    ]
    const result = filterGroupsByPendingDeletions(groups, tombstones, 'env-1')
    expect(result.map((g) => g.id)).toEqual(['group-sibling'])
  })

  it('keeps unrelated sibling groups untouched', () => {
    const groups = [
      makeGroup({ id: 'group-1', parentGroupId: null }),
      makeGroup({ id: 'group-2', parentGroupId: null })
    ]
    const tombstones = [makeTombstone({ groupId: 'group-1', subtreeGroupIds: ['group-1'] })]
    const result = filterGroupsByPendingDeletions(groups, tombstones, 'env-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('group-2')
  })

  it('does not mutate the input array', () => {
    const groups = [makeGroup({ id: 'group-1' })]
    const tombstones = [makeTombstone({ groupId: 'group-1', subtreeGroupIds: ['group-1'] })]
    const original = [...groups]
    filterGroupsByPendingDeletions(groups, tombstones, 'env-1')
    expect(groups).toEqual(original)
  })

  it('returns all groups when no tombstones match the environment', () => {
    const groups = [makeGroup({ id: 'group-1' })]
    const tombstones = [
      makeTombstone({ environmentId: 'env-2', groupId: 'group-1', subtreeGroupIds: ['group-1'] })
    ]
    const result = filterGroupsByPendingDeletions(groups, tombstones, 'env-1')
    expect(result).toHaveLength(1)
  })
})

describe('applyPendingDeletionsToRepos', () => {
  it('detaches repos in the subtree when removeContainedProjects is false', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const repos = [makeRepo({ id: 'repo-1', projectGroupId: 'group-1' })]
    const tombstones = [
      makeTombstone({
        groupId: 'group-1',
        removeContainedProjects: false,
        subtreeGroupIds: ['group-1']
      })
    ]
    const result = applyPendingDeletionsToRepos(repos, groups, tombstones, 'env-1')
    expect(result).toHaveLength(1)
    expect(result[0].projectGroupId).toBeNull()
  })

  it('removes repos in the subtree when removeContainedProjects is true', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const repos = [makeRepo({ id: 'repo-1', projectGroupId: 'group-1' })]
    const tombstones = [
      makeTombstone({
        groupId: 'group-1',
        removeContainedProjects: true,
        subtreeGroupIds: ['group-1']
      })
    ]
    const result = applyPendingDeletionsToRepos(repos, groups, tombstones, 'env-1')
    expect(result).toHaveLength(0)
  })

  it('removes repos explicitly listed in pendingProjectIds regardless of removeContainedProjects', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const repos = [
      makeRepo({ id: 'repo-explicit', projectGroupId: 'group-1' }),
      makeRepo({ id: 'repo-other', projectGroupId: 'group-1' })
    ]
    const tombstones = [
      makeTombstone({
        groupId: 'group-1',
        removeContainedProjects: false,
        pendingProjectIds: ['repo-explicit'],
        subtreeGroupIds: ['group-1']
      })
    ]
    const result = applyPendingDeletionsToRepos(repos, groups, tombstones, 'env-1')
    // repo-explicit: in pendingProjectIds → removed
    // repo-other: in subtree but removeContainedProjects=false → detached
    const ids = result.map((r) => r.id)
    expect(ids).not.toContain('repo-explicit')
    expect(ids).toContain('repo-other')
    expect(result.find((r) => r.id === 'repo-other')?.projectGroupId).toBeNull()
  })

  it('keeps repos unaffected by different environment tombstones unchanged', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const repos = [makeRepo({ id: 'repo-1', projectGroupId: 'group-1' })]
    const tombstones = [
      makeTombstone({ environmentId: 'env-2', groupId: 'group-1', subtreeGroupIds: ['group-1'] })
    ]
    const result = applyPendingDeletionsToRepos(repos, groups, tombstones, 'env-1')
    expect(result).toHaveLength(1)
    expect(result[0].projectGroupId).toBe('group-1')
  })

  it('leaves repos outside the tombstoned subtree unchanged', () => {
    const groups = [
      makeGroup({ id: 'group-1', parentGroupId: null }),
      makeGroup({ id: 'group-2', parentGroupId: null })
    ]
    const repos = [
      makeRepo({ id: 'repo-1', projectGroupId: 'group-1' }),
      makeRepo({ id: 'repo-2', projectGroupId: 'group-2' })
    ]
    const tombstones = [
      makeTombstone({
        groupId: 'group-1',
        removeContainedProjects: true,
        subtreeGroupIds: ['group-1']
      })
    ]
    const result = applyPendingDeletionsToRepos(repos, groups, tombstones, 'env-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('repo-2')
    expect(result[0].projectGroupId).toBe('group-2')
  })

  it('does not mutate the input repos array', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const repos = [makeRepo({ id: 'repo-1', projectGroupId: 'group-1' })]
    const tombstones = [
      makeTombstone({
        groupId: 'group-1',
        removeContainedProjects: false,
        subtreeGroupIds: ['group-1']
      })
    ]
    const original = repos.map((r) => ({ ...r }))
    applyPendingDeletionsToRepos(repos, groups, tombstones, 'env-1')
    expect(repos[0]).toEqual(original[0])
  })

  it('leaves repos owned by a different host untouched even when ids/group collide (host guard)', () => {
    // The merged repo list is multi-host: a repo with the SAME group id or the
    // SAME explicit id can belong to a different execution host and must not be
    // detached or hidden by this environment's tombstone.
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const repos = [
      // Owned by the tombstone's env → should be removed.
      makeRepo({ id: 'owned', projectGroupId: 'group-1', executionHostId: 'runtime:env-1' }),
      // Same group id, but owned by another host → must be left alone.
      makeRepo({ id: 'other-host', projectGroupId: 'group-1', executionHostId: 'runtime:env-2' }),
      // Same explicit pendingProjectIds id, but owned by another host → left alone.
      makeRepo({ id: 'owned', projectGroupId: 'group-1', executionHostId: 'ssh:relay' })
    ]
    const tombstones = [
      makeTombstone({
        groupId: 'group-1',
        removeContainedProjects: true,
        pendingProjectIds: ['owned'],
        subtreeGroupIds: ['group-1']
      })
    ]
    const ownsRepo = (repo: Repo): boolean => repo.executionHostId === 'runtime:env-1'
    const result = applyPendingDeletionsToRepos(repos, groups, tombstones, 'env-1', { ownsRepo })
    // env-2 repo and the ssh repo survive unchanged; only the env-1 repo is removed.
    expect(result.map((r) => r.executionHostId)).toEqual(['runtime:env-2', 'ssh:relay'])
    expect(result.every((r) => r.projectGroupId === 'group-1')).toBe(true)
  })
})

describe('filterFolderWorkspacesByPendingDeletions', () => {
  it('removes workspaces whose projectGroupId is in the tombstoned subtree', () => {
    const groups = [
      makeGroup({ id: 'group-1', parentGroupId: null }),
      makeGroup({ id: 'group-child', parentGroupId: 'group-1' })
    ]
    const workspaces = [
      makeWorkspace({ id: 'ws-1', projectGroupId: 'group-1' }),
      makeWorkspace({ id: 'ws-2', projectGroupId: 'group-child' }),
      makeWorkspace({ id: 'ws-3', projectGroupId: 'group-other' })
    ]
    const tombstones = [
      makeTombstone({ groupId: 'group-1', subtreeGroupIds: ['group-1', 'group-child'] })
    ]
    const result = filterFolderWorkspacesByPendingDeletions(workspaces, groups, tombstones, 'env-1')
    expect(result.map((w) => w.id)).toEqual(['ws-3'])
  })

  it('keeps workspaces outside the tombstoned subtree', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const workspaces = [
      makeWorkspace({ id: 'ws-1', projectGroupId: 'group-1' }),
      makeWorkspace({ id: 'ws-2', projectGroupId: 'group-2' })
    ]
    const tombstones = [makeTombstone({ groupId: 'group-1', subtreeGroupIds: ['group-1'] })]
    const result = filterFolderWorkspacesByPendingDeletions(workspaces, groups, tombstones, 'env-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ws-2')
  })

  it('does not mutate the input workspaces array', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const workspaces = [makeWorkspace({ id: 'ws-1', projectGroupId: 'group-1' })]
    const tombstones = [makeTombstone({ groupId: 'group-1', subtreeGroupIds: ['group-1'] })]
    const original = [...workspaces]
    filterFolderWorkspacesByPendingDeletions(workspaces, groups, tombstones, 'env-1')
    expect(workspaces).toEqual(original)
  })

  it('returns all workspaces when tombstones are for a different environment', () => {
    const groups = [makeGroup({ id: 'group-1', parentGroupId: null })]
    const workspaces = [makeWorkspace({ id: 'ws-1', projectGroupId: 'group-1' })]
    const tombstones = [
      makeTombstone({ environmentId: 'env-2', groupId: 'group-1', subtreeGroupIds: ['group-1'] })
    ]
    const result = filterFolderWorkspacesByPendingDeletions(workspaces, groups, tombstones, 'env-1')
    expect(result).toHaveLength(1)
  })
})
