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

/** Section title: the repo name, or the worktree folder name when one repo has several sections. */
export function folderRepoSectionLabel(
  member: LabelMember,
  members: readonly LabelMember[]
): string {
  const identity = getWorktreeGitIdentityDisplay(member.worktree)
  const branch = identity?.kind === 'branch' ? identity.branchName : null
  let name = baseName(member, members)
  // Why: identical titles (same folder name under different parents) need the parent folder to be told apart.
  if (members.some((other) => other !== member && baseName(other, members) === name)) {
    name = `${basename(dirname(member.worktree.path))}/${basename(member.worktree.path)}`
  }
  return branch ? `${name} (${branch})` : name
}
