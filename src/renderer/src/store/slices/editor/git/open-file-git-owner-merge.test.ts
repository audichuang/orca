import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'

describe('openFile git owner merge', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
  })

  it('drops a repo git owner when the same file reopens with a folder-relative path', () => {
    const base = {
      filePath: '/f/a/src/x.ts',
      worktreeId: 'folder:f1',
      runtimeEnvironmentId: null,
      language: 'typescript',
      mode: 'edit' as const
    }
    const state = useAppStore.getState()
    state.openFile(
      { ...base, relativePath: 'src/x.ts', gitWorktreeId: 'repo-a' },
      { suppressActiveRuntimeFallback: true }
    )
    state.openFile({ ...base, relativePath: 'a/src/x.ts' }, { suppressActiveRuntimeFallback: true })
    const files = useAppStore.getState().openFiles
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ relativePath: 'a/src/x.ts', gitWorktreeId: undefined })
  })

  it('keeps the git owner when the relative path is unchanged', () => {
    const base = {
      filePath: '/f/a/src/x.ts',
      relativePath: 'src/x.ts',
      worktreeId: 'folder:f1',
      runtimeEnvironmentId: null,
      language: 'typescript',
      mode: 'edit' as const
    }
    const state = useAppStore.getState()
    state.openFile({ ...base, gitWorktreeId: 'repo-a' }, { suppressActiveRuntimeFallback: true })
    state.openFile(base, { suppressActiveRuntimeFallback: true })
    expect(useAppStore.getState().openFiles[0]?.gitWorktreeId).toBe('repo-a')
  })

  it('upgrades an already-open folder tab when only its git owner becomes known', () => {
    const file = {
      filePath: '/work/folder/repo-a/src/a.ts',
      relativePath: 'src/a.ts',
      worktreeId: 'folder:folder',
      runtimeEnvironmentId: null,
      language: 'typescript',
      mode: 'edit' as const
    }
    const state = useAppStore.getState()
    state.openFile(file, { suppressActiveRuntimeFallback: true })
    // Settle preview pinning before discovering only the git owner.
    state.openFile(file, { suppressActiveRuntimeFallback: true })
    state.openFile({ ...file, gitWorktreeId: 'repo-a' }, { suppressActiveRuntimeFallback: true })
    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({ gitWorktreeId: 'repo-a' })
    ])
  })
})
