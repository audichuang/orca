import type { GitConflictOperation } from '../../../../../../shared/git/status/git-status-types'
import type { SourceControlActionError } from '../sync/action-error'

type CommitErrorsByWorktree = Record<string, string | null>
type RemoteActionErrorsByWorktree = Record<string, SourceControlActionError | null>

// Why: a folder workspace remounts the repo panel on every repo switch; keep failure cards for the session like commit drafts.
let sessionCommitErrors: CommitErrorsByWorktree = {}
let sessionRemoteActionErrors: RemoteActionErrorsByWorktree = {}
// Why: a remount must still see the operation that ended while unmounted, or its failure card is never cleared.
let sessionConflictOperations: Record<string, GitConflictOperation> = {}

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

export function loadSessionConflictOperations(): Record<string, GitConflictOperation> {
  return sessionConflictOperations
}

export function saveSessionConflictOperations(next: Record<string, GitConflictOperation>): void {
  sessionConflictOperations = next
}
