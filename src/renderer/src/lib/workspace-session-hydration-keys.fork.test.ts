import { describe, expect, it } from 'vitest'
import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'
import { collectWorktreeHydrationRepoIdsFromSession } from './workspace-session-hydration-keys'

describe('collectWorktreeHydrationRepoIdsFromSession for a scoped tab git owner', () => {
  it('includes the git owner repo of a scoped tab under a folder workspace', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a minimal persisted session with only openFilesByWorktree.
    const session = {
      openFilesByWorktree: {
        'folder:folder-1': [{ gitWorktreeId: 'repo-a::/f/a' }, { filePath: '/f/x.ts' }]
      }
    } as unknown as WorkspaceSessionState

    expect(collectWorktreeHydrationRepoIdsFromSession(session)).toEqual(['repo-a'])
  })
})
