import { describe, expect, it, vi } from 'vitest'
import { createEditorStore } from './editor-slice-test-harness'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))

describe('editor session hydration of a scoped tab git owner', () => {
  it('restores the git owner of a scoped tab and ignores an unknown one', () => {
    const store = createEditorStore()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test seeds only the worktree catalog hydration reads.
    store.setState({
      worktreesByRepo: { 'repo-1': [{ id: 'wt-1' }, { id: 'repo-a' }] },
      folderWorkspaces: []
    } as never)
    const saved = (filePath: string, gitWorktreeId?: string) => ({
      filePath,
      relativePath: 'x.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      ...(gitWorktreeId ? { gitWorktreeId } : {})
    })

    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a minimal persisted session with only openFilesByWorktree.
    store.getState().hydrateEditorSession({
      openFilesByWorktree: {
        'wt-1': [saved('/f/a/x.ts', 'repo-a'), saved('/f/b/x.ts', 'gone'), saved('/f/c/x.ts')]
      }
    } as never)

    const owners = Object.fromEntries(
      store.getState().openFiles.map((f) => [f.filePath, f.gitWorktreeId])
    )
    expect(owners).toEqual({
      '/f/a/x.ts': 'repo-a',
      '/f/b/x.ts': undefined,
      '/f/c/x.ts': undefined
    })
  })

  it('keeps the git owner when its repo is known but its worktrees are not loaded yet', () => {
    const store = createEditorStore()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test seeds only the catalog hydration reads.
    store.setState({
      repos: [{ id: 'repo-a' }],
      worktreesByRepo: { 'repo-1': [{ id: 'wt-1' }] },
      folderWorkspaces: []
    } as never)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a minimal persisted session with only openFilesByWorktree.
    store.getState().hydrateEditorSession({
      openFilesByWorktree: {
        'wt-1': [
          {
            filePath: '/f/a/x.ts',
            relativePath: 'x.ts',
            worktreeId: 'wt-1',
            language: 'typescript',
            gitWorktreeId: 'repo-a::/f/a'
          }
        ]
      }
    } as never)
    expect(store.getState().openFiles[0]?.gitWorktreeId).toBe('repo-a::/f/a')
  })
})
