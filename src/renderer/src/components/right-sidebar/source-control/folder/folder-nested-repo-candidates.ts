import type { AppState } from '@/store/types'
import { getAllWorktreesFromState } from '@/store/selectors'
import { normalizeRuntimePathForComparison } from '../../../../../../shared/cross-platform-path'
import type { NestedRepoCandidate } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { folderSidebarHiddenRepoKey } from './folder-sidebar-hidden-repos'

type FolderOwner = Pick<Repo, 'connectionId' | 'executionHostId'>

// Why deeper than Add Project's default 3: monorepo folders nest repos inside repos (folder/docs/guide).
export const FOLDER_NESTED_REPO_SCAN_OPTIONS = { descendIntoRepos: true, maxDepth: 4 }

/**
 * Scanned repos under the folder that Orca does not know yet on the folder's host, in path order.
 * Linked worktrees of added repos are known too: their `.git` file looks like a repo to the scan.
 */
export function getNewNestedRepoCandidates(args: {
  folderPath: string
  folderOwner: FolderOwner
  scanned: readonly NestedRepoCandidate[]
  repos: readonly Repo[]
  worktrees: readonly Pick<Worktree, 'repoId' | 'path'>[]
}): NestedRepoCandidate[] {
  const repoById = new Map(args.repos.map((repo) => [repo.id, repo]))
  const known = new Set(args.repos.map((repo) => folderSidebarHiddenRepoKey(repo)))
  for (const worktree of args.worktrees) {
    const repo = repoById.get(worktree.repoId)
    if (repo) {
      known.add(folderSidebarHiddenRepoKey({ ...repo, path: worktree.path }))
    }
  }
  const folderPath = normalizeRuntimePathForComparison(args.folderPath)
  return args.scanned
    .filter(
      (candidate) =>
        normalizeRuntimePathForComparison(candidate.path) !== folderPath &&
        !known.has(folderSidebarHiddenRepoKey({ ...args.folderOwner, path: candidate.path }))
    )
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** getNewNestedRepoCandidates against the store, counting detected linked worktrees as known too. */
export function getNewNestedRepoCandidatesFromState(
  state: Pick<AppState, 'repos' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  folder: FolderOwner & { folderPath: string },
  scanned: readonly NestedRepoCandidate[]
): NestedRepoCandidate[] {
  return getNewNestedRepoCandidates({
    folderPath: folder.folderPath,
    folderOwner: folder,
    scanned,
    repos: state.repos,
    worktrees: [
      ...getAllWorktreesFromState(state),
      ...Object.entries(state.detectedWorktreesByRepo).flatMap(([repoId, detected]) =>
        (detected?.worktrees ?? []).map((worktree) => ({ repoId, path: worktree.path }))
      )
    ]
  })
}

/** Path shown in the picker, relative to the folder so nested repos read as `docs/guide`. */
export function nestedRepoRelativeLabel(folderPath: string, repoPath: string): string {
  const trimmed = folderPath.replace(/[\\/]+$/, '')
  const rest = repoPath.slice(trimmed.length)
  return repoPath.startsWith(trimmed) && /^[\\/]/.test(rest)
    ? rest.replace(/^[\\/]+/, '')
    : repoPath
}
