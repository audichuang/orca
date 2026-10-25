import { describe, expect, it, vi } from 'vitest'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { openUncommittedEntry } from './open-uncommitted-entry'

function fakeState() {
  return {
    trackConflictPath: vi.fn(),
    openConflictFile: vi.fn(),
    openFile: vi.fn(),
    openDiff: vi.fn()
  }
}

const folderOptions = { preview: true, gitWorktreeId: 'repo-wt' }

describe('openUncommittedEntry in a folder workspace', () => {
  it('opens the diff tab in the folder and keeps git on the repo', () => {
    const state = fakeState()
    const entry: GitStatusEntry = { path: 'src/a.ts', area: 'staged', status: 'modified' }

    openUncommittedEntry(state, 'repo-wt', '/f/repo', entry, {
      ...folderOptions,
      tabWorktreeId: 'folder-wt'
    })

    expect(state.openDiff).toHaveBeenCalledWith(
      'folder-wt',
      '/f/repo/src/a.ts',
      'src/a.ts',
      'typescript',
      true,
      folderOptions
    )
  })

  it('tracks conflicts on the repo but opens the conflict tab in the folder', () => {
    const state = fakeState()
    const entry: GitStatusEntry = {
      path: 'src/a.ts',
      area: 'unstaged',
      status: 'modified',
      conflictKind: 'both_modified',
      conflictStatus: 'unresolved'
    }

    openUncommittedEntry(state, 'repo-wt', '/f/repo', entry, {
      ...folderOptions,
      tabWorktreeId: 'folder-wt'
    })

    expect(state.trackConflictPath).toHaveBeenCalledWith('repo-wt', 'src/a.ts', 'both_modified')
    expect(state.openConflictFile).toHaveBeenCalledWith(
      'folder-wt',
      '/f/repo',
      entry,
      'typescript',
      folderOptions
    )
  })

  it('opens new markdown as a folder edit tab that reads git from the repo', () => {
    const state = fakeState()
    const entry: GitStatusEntry = { path: 'README.md', area: 'untracked', status: 'untracked' }

    openUncommittedEntry(state, 'repo-wt', '/f/repo', entry, {
      ...folderOptions,
      tabWorktreeId: 'folder-wt'
    })

    expect(state.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'folder-wt', gitWorktreeId: 'repo-wt' }),
      folderOptions
    )
  })

  it('uses the repo worktree for tabs outside a folder workspace', () => {
    const state = fakeState()
    const entry: GitStatusEntry = { path: 'src/a.ts', area: 'unstaged', status: 'modified' }

    openUncommittedEntry(state, 'repo-wt', '/repo', entry)

    expect(state.openDiff.mock.calls[0][0]).toBe('repo-wt')
  })
})
