import { describe, expect, it, vi } from 'vitest'
import { createEditorStore } from './editor-slice-test-harness'

vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)
vi.mock('@/runtime/runtime-layout-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeLayoutClientWithTestFrames(await importOriginal())
)
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))

describe('createEditorSlice openDiff in a folder workspace', () => {
  it('records the git owner of a folder-scoped diff and keeps repos apart', () => {
    const store = createEditorStore()

    store.getState().openDiff('folder:f1', '/work/a/README.md', 'README.md', 'markdown', false, {
      gitWorktreeId: 'repo-a'
    })
    store.getState().openDiff('folder:f1', '/work/b/README.md', 'README.md', 'markdown', false, {
      gitWorktreeId: 'repo-b'
    })

    expect(store.getState().openFiles).toEqual([
      expect.objectContaining({ worktreeId: 'folder:f1', gitWorktreeId: 'repo-a' }),
      expect.objectContaining({ worktreeId: 'folder:f1', gitWorktreeId: 'repo-b' })
    ])
    expect(new Set(store.getState().openFiles.map((file) => file.id)).size).toBe(2)
  })
})
