// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GitConflictOperation } from '../../../../../../shared/git/status/git-status-types'
import type { SourceControlActionError } from '../sync/action-error'
import { mountProbe, unmountProbes } from './source-control-hook-test-harness'
import {
  saveSessionCommitErrors,
  saveSessionConflictOperations,
  saveSessionRemoteActionErrors
} from './operation-error-session'
import {
  useSourceControlWorktreeOperationState,
  type SourceControlWorktreeOperationState
} from './use-worktree-operation-state'

const W = 'repo::/work/repo'
// Why: worktreeMap must contain W or the prune effect clears the error for the wrong reason.
const worktreeMap = new Map([[W, {}]])

let latest: SourceControlWorktreeOperationState | null = null

function Probe({ operations }: { operations: Record<string, GitConflictOperation> }) {
  latest = useSourceControlWorktreeOperationState({
    activeWorktreeId: W,
    conflictOperationsByWorktree: operations,
    worktreeMap
  })
  return null
}

function error(kind: SourceControlActionError['kind']): SourceControlActionError {
  return { kind, message: 'failed', rawError: 'failed' }
}

async function failThenRemount(
  kind: SourceControlActionError['kind'],
  before: Record<string, GitConflictOperation>,
  after: Record<string, GitConflictOperation>
) {
  await mountProbe(<Probe operations={before} />)
  await act(async () => {
    latest!.setRemoteActionErrors({ [W]: error(kind) })
  })
  unmountProbes()
  await mountProbe(<Probe operations={after} />)
}

beforeEach(() => {
  latest = null
  saveSessionCommitErrors({})
  saveSessionRemoteActionErrors({})
  saveSessionConflictOperations({})
})
afterEach(unmountProbes)

describe('remote action errors across a Source Control remount', () => {
  it('clears a pull failure whose rebase ended while the panel was unmounted', async () => {
    await failThenRemount('pull', { [W]: 'rebase' }, {})
    expect(latest!.remoteActionError).toBeNull()
  })

  it('keeps a failure that is not tied to a conflict operation', async () => {
    await failThenRemount('push', { [W]: 'rebase' }, {})
    expect(latest!.remoteActionError?.kind).toBe('push')
  })
})
