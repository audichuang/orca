import { describe, expect, it, vi } from 'vitest'
import { createEditorStore } from './editor/editor-slice-test-harness'

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', async (importOriginal) =>
  (
    await import('@/runtime/workspace-layout/testing/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)
vi.mock('@/runtime/workspace-layout/frames/runtime-layout-client', async (importOriginal) =>
  (
    await import('@/runtime/workspace-layout/testing/layout-apply-test-transport.test-fixture')
  ).runtimeLayoutClientWithTestFrames(await importOriginal())
)
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/web-session-tabs-sync/closing/close-mirrored-editor-tab', () => ({
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
