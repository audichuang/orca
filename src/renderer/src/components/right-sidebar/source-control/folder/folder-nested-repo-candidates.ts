import { normalizeRuntimePathForComparison } from '../../../../../../shared/cross-platform-path'
import type { NestedRepoCandidate } from '../../../../../../shared/project-group-types'
import type { Repo } from '../../../../../../shared/repo-types'
import { folderSidebarHiddenRepoKey } from './folder-sidebar-hidden-repos'

type FolderOwner = Pick<Repo, 'connectionId' | 'executionHostId'>

/** Scanned repos under the folder that Orca does not know yet on the folder's host, in path order. */
export function getNewNestedRepoCandidates(args: {
  folderPath: string
  folderOwner: FolderOwner
  scanned: readonly NestedRepoCandidate[]
  repos: readonly Repo[]
}): NestedRepoCandidate[] {
  const known = new Set(args.repos.map((repo) => folderSidebarHiddenRepoKey(repo)))
  const folderPath = normalizeRuntimePathForComparison(args.folderPath)
  return args.scanned
    .filter(
      (candidate) =>
        normalizeRuntimePathForComparison(candidate.path) !== folderPath &&
        !known.has(folderSidebarHiddenRepoKey({ ...args.folderOwner, path: candidate.path }))
    )
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** Path shown in the picker, relative to the folder so nested repos read as `docs/etf`. */
export function nestedRepoRelativeLabel(folderPath: string, repoPath: string): string {
  const trimmed = folderPath.replace(/[\\/]+$/, '')
  const rest = repoPath.slice(trimmed.length)
  return repoPath.startsWith(trimmed) && /^[\\/]/.test(rest)
    ? rest.replace(/^[\\/]+/, '')
    : repoPath
}
