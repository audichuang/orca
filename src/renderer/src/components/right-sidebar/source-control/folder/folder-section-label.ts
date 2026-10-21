import { basename, dirname } from '@/lib/path'
import { getWorktreeGitIdentityDisplay } from '../../../../../../shared/worktree/git-identity-display'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'

type LabelMember = {
  repo: Pick<Repo, 'id' | 'displayName'>
  worktree: Pick<Worktree, 'path' | 'branch' | 'head'>
}

function baseName(member: LabelMember, members: readonly LabelMember[]): string {
  const sharesRepo = members.some((other) => other !== member && other.repo.id === member.repo.id)
  return sharesRepo ? basename(member.worktree.path) : member.repo.displayName
}

/** Row title: the repo name, or the worktree folder name when one repo has several rows. */
export function folderRepoSectionName(
  member: LabelMember,
  members: readonly LabelMember[]
): string {
  const name = baseName(member, members)
  // Why: identical titles (same folder name under different parents) need the parent folder to be told apart.
  if (members.some((other) => other !== member && baseName(other, members) === name)) {
    return `${basename(dirname(member.worktree.path))}/${basename(member.worktree.path)}`
  }
  return name
}

/** Checked-out branch name, or null when HEAD is detached. */
export function folderRepoSectionBranch(member: LabelMember): string | null {
  const identity = getWorktreeGitIdentityDisplay(member.worktree)
  return identity?.kind === 'branch' ? identity.branchName : null
}

/** Name and branch as one string, which is what the repo filter matches against. */
export function folderRepoSectionLabel(
  member: LabelMember,
  members: readonly LabelMember[]
): string {
  const name = folderRepoSectionName(member, members)
  const branch = folderRepoSectionBranch(member)
  return branch ? `${name} (${branch})` : name
}
