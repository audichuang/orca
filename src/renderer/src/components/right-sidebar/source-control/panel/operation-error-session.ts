import type { SourceControlActionError } from '../sync/action-error'

type CommitErrorsByWorktree = Record<string, string | null>
type RemoteActionErrorsByWorktree = Record<string, SourceControlActionError | null>

// Why: a folder workspace remounts the repo panel on every repo switch; keep failure cards for the session like commit drafts.
let sessionCommitErrors: CommitErrorsByWorktree = {}
let sessionRemoteActionErrors: RemoteActionErrorsByWorktree = {}

export function loadSessionCommitErrors(): CommitErrorsByWorktree {
  return sessionCommitErrors
}

export function saveSessionCommitErrors(next: CommitErrorsByWorktree): void {
  sessionCommitErrors = next
}

export function loadSessionRemoteActionErrors(): RemoteActionErrorsByWorktree {
  return sessionRemoteActionErrors
}

export function saveSessionRemoteActionErrors(next: RemoteActionErrorsByWorktree): void {
  sessionRemoteActionErrors = next
}
