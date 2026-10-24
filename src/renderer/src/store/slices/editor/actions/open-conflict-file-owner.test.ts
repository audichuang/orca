import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'

const entry = {
  path: 'src/x.ts',
  status: 'modified' as const,
  area: 'unstaged' as const,
  conflictKind: 'both_modified' as const,
  conflictStatus: 'unresolved' as const,
  conflictStatusSource: 'git' as const
}

describe('openConflictFile owner isolation', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
  })

  it('opens a separate folder-owned tab instead of reusing the repo owner tab', () => {
    const state = useAppStore.getState()
    state.openConflictFile('repo-a', '/f/a', entry, 'typescript')
    state.openConflictFile('folder:f1', '/f/a', entry, 'typescript', { gitWorktreeId: 'repo-a' })
    const files = useAppStore.getState().openFiles
    expect(files).toHaveLength(2)
    const folderFile = files.find((f) => f.worktreeId === 'folder:f1')
    expect(folderFile).toMatchObject({ gitWorktreeId: 'repo-a' })
    expect(useAppStore.getState().activeFileId).toBe(folderFile?.id)
    expect(files.find((f) => f.worktreeId === 'repo-a')?.gitWorktreeId).toBeUndefined()
  })

  it('tracks a folder-owned conflict under its git owner, where status reconciliation reads it', () => {
    useAppStore
      .getState()
      .openConflictFile('folder:f1', '/f/a', entry, 'typescript', { gitWorktreeId: 'repo-a' })
    const tracked = useAppStore.getState().trackedConflictPathsByWorktree
    expect(tracked['repo-a']).toEqual({ 'src/x.ts': 'both_modified' })
    expect(tracked['folder:f1']).toBeUndefined()
  })

  it('keeps the git owner when the folder tab is reopened without one', () => {
    const state = useAppStore.getState()
    state.openConflictFile('folder:f1', '/f/a', entry, 'typescript', { gitWorktreeId: 'repo-a' })
    state.openConflictFile('folder:f1', '/f/a', entry, 'typescript')
    const files = useAppStore.getState().openFiles
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ worktreeId: 'folder:f1', gitWorktreeId: 'repo-a' })
  })
})
