import type { FolderWorkspace, PendingProjectGroupDeletion, ProjectGroup, Repo } from './types'
import { getProjectGroupSubtreeIds } from './project-groups'

export function selectPendingDeletionsForEnvironment(
  tombstones: readonly PendingProjectGroupDeletion[],
  environmentId: string
): PendingProjectGroupDeletion[] {
  return tombstones.filter((t) => t.environmentId === environmentId)
}

/**
 * Computes the union of tombstoned group ids for an environment.
 * Each tombstone contributes its stored subtreeGroupIds snapshot PLUS a live
 * subtree walk — the union ensures correctness whether the group tree has
 * grown or shrunk since the tombstone was written.
 */
export function collectTombstonedGroupIds(
  groups: readonly Pick<ProjectGroup, 'id' | 'parentGroupId'>[],
  tombstones: readonly PendingProjectGroupDeletion[],
  environmentId: string
): Set<string> {
  const result = new Set<string>()
  const relevant = selectPendingDeletionsForEnvironment(tombstones, environmentId)
  for (const tombstone of relevant) {
    // Always include the stored snapshot so removal works even with empty groups.
    for (const id of tombstone.subtreeGroupIds) {
      result.add(id)
    }
    // Re-walk the live tree to catch groups added after the tombstone was written.
    if (groups.length > 0) {
      for (const id of getProjectGroupSubtreeIds(groups, tombstone.groupId)) {
        result.add(id)
      }
    }
  }
  return result
}

export function filterGroupsByPendingDeletions(
  groups: readonly ProjectGroup[],
  tombstones: readonly PendingProjectGroupDeletion[],
  environmentId: string
): ProjectGroup[] {
  const tombstonedIds = collectTombstonedGroupIds(groups, tombstones, environmentId)
  return groups.filter((g) => !tombstonedIds.has(g.id))
}

export function applyPendingDeletionsToRepos(
  repos: readonly Repo[],
  groups: readonly ProjectGroup[],
  tombstones: readonly PendingProjectGroupDeletion[],
  environmentId: string,
  // Why: the merged repo list spans multiple hosts. A repo only counts as
  // owned by this environment if ownsRepo says so; same-id/same-group repos on
  // other hosts must be passed through untouched. Defaults to "owns all" for
  // back-compatible callers (and the pure unit tests).
  options?: { ownsRepo?: (repo: Repo) => boolean }
): Repo[] {
  const ownsRepo = options?.ownsRepo ?? (() => true)
  const tombstonedGroupIds = collectTombstonedGroupIds(groups, tombstones, environmentId)
  const relevant = selectPendingDeletionsForEnvironment(tombstones, environmentId)

  // Build a set of repo ids explicitly listed in any tombstone's pendingProjectIds.
  const explicitRemoveIds = new Set<string>()
  // Build a set of group ids whose tombstone has removeContainedProjects=true.
  const hardRemoveGroupIds = new Set<string>()

  for (const tombstone of relevant) {
    for (const repoId of tombstone.pendingProjectIds) {
      explicitRemoveIds.add(repoId)
    }
    if (tombstone.removeContainedProjects) {
      for (const groupId of getProjectGroupSubtreeIds(groups, tombstone.groupId)) {
        hardRemoveGroupIds.add(groupId)
      }
      for (const groupId of tombstone.subtreeGroupIds) {
        hardRemoveGroupIds.add(groupId)
      }
    }
  }

  const result: Repo[] = []
  for (const repo of repos) {
    if (!ownsRepo(repo)) {
      // Repo belongs to a different host — this environment's tombstones must
      // never detach or hide it, even on a group-id or repo-id collision.
      result.push(repo)
      continue
    }
    const inSubtree = repo.projectGroupId != null && tombstonedGroupIds.has(repo.projectGroupId)
    const explicitlyRemoved = explicitRemoveIds.has(repo.id)

    if (!inSubtree && !explicitlyRemoved) {
      // Repo is unaffected by any tombstone for this environment.
      result.push(repo)
      continue
    }

    // Repo is in scope of a pending deletion.
    const hardRemove =
      explicitlyRemoved ||
      (repo.projectGroupId != null && hardRemoveGroupIds.has(repo.projectGroupId))

    if (hardRemove) {
      // Remove from results entirely.
      continue
    }

    // Soft removal: detach from the group but keep the repo.
    result.push({ ...repo, projectGroupId: null })
  }
  return result
}

export function filterFolderWorkspacesByPendingDeletions(
  workspaces: readonly FolderWorkspace[],
  groups: readonly ProjectGroup[],
  tombstones: readonly PendingProjectGroupDeletion[],
  environmentId: string
): FolderWorkspace[] {
  const tombstonedGroupIds = collectTombstonedGroupIds(groups, tombstones, environmentId)
  return workspaces.filter((ws) => !tombstonedGroupIds.has(ws.projectGroupId))
}
