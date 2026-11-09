import type { AppState } from '@/store/types'
import { getIndexedAllWorktrees } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { normalizeRuntimePathForComparison } from '../../../../../../shared/cross-platform-path'
import type { NestedRepoCandidate } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  selectDetectedWorktreesByRepo,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'
import { getFilesystemOwnerKey } from './folder-git-worktrees'

type FolderOwner = Pick<Repo, 'connectionId' | 'executionHostId'>

// Why path, not repo id: a removed and re-added repo mints a new id but is the same checkout.
function repoPathKey(repo: Pick<Repo, 'path' | 'connectionId' | 'executionHostId'>): string {
  return `${getFilesystemOwnerKey(repo)}\n${normalizeRuntimePathForComparison(repo.path)}`
}

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
  const known = new Set(args.repos.map((repo) => repoPathKey(repo)))
  for (const worktree of args.worktrees) {
    const repo = repoById.get(worktree.repoId)
    if (repo) {
      known.add(repoPathKey({ ...repo, path: worktree.path }))
    }
  }
  const folderPath = normalizeRuntimePathForComparison(args.folderPath)
  return args.scanned
    .filter(
      (candidate) =>
        normalizeRuntimePathForComparison(candidate.path) !== folderPath &&
        !known.has(repoPathKey({ ...args.folderOwner, path: candidate.path }))
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
      ...getIndexedAllWorktrees(selectWorktreesByRepo(state)),
      ...Object.entries(selectDetectedWorktreesByRepo(state)).flatMap(([repoId, detected]) =>
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
