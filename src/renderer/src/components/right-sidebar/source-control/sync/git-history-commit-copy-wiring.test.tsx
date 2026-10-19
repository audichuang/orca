// @vitest-environment happy-dom
// Fork seam guard: context-menu action -> commit actions hook -> copy -> commit-diff client -> clipboard.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitHistoryItem } from '../../../../../../shared/git-history'

const mocks = vi.hoisted(() => ({
  getRuntimeGitCommitDiff: vi.fn(),
  getRuntimeGitCommitCompare: vi.fn(),
  writeClipboardText: vi.fn()
}))
vi.mock('@/runtime/runtime-git-diff-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getRuntimeGitCommitDiff: mocks.getRuntimeGitCommitDiff,
  getRuntimeGitCommitCompare: mocks.getRuntimeGitCommitCompare
}))
vi.mock('@/store', () => {
  const state = { openCommitAllDiffs: vi.fn(), openCommitDiff: vi.fn(), folderWorkspaces: [] }
  const useAppStore = (selector: (s: typeof state) => unknown) => selector(state)
  useAppStore.getState = () => state
  return { useAppStore }
})
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const { useGitHistoryCommitActions } = await import('./use-git-history-commit-actions')

const PARENT = '1'.repeat(40)
function item(id: string, timestamp: number): GitHistoryItem {
  return { id: id.repeat(40), parentIds: [PARENT], subject: id, message: id, timestamp }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Copy Full Source from the Commits context menu (fork wiring)', () => {
  it('copies every selected commit through the commit-diff client', async () => {
    vi.stubGlobal('window', {
      ...window,
      api: { ui: { writeClipboardText: mocks.writeClipboardText } }
    })
    const a = item('a', 2000)
    const b = item('b', 1000)
    mocks.getRuntimeGitCommitCompare.mockImplementation(async (_ctx, commitOid: string) => ({
      summary: { status: 'ready' },
      entries: [{ path: `${commitOid[0]}.txt`, status: 'modified' }]
    }))
    mocks.getRuntimeGitCommitDiff.mockImplementation(async (_ctx, args) => ({
      kind: 'text',
      originalContent: 'old',
      modifiedContent: `content of ${args.filePath}`,
      originalIsBinary: false,
      modifiedIsBinary: false
    }))
    const { result } = renderHook(() =>
      useGitHistoryCommitActions({
        activeWorktreeId: 'wt-1',
        editorWorktreeId: 'wt-1',
        worktreePath: '/repo',
        activeRepoTarget: { kind: 'local' },
        resolveSplitTargetGroupId: () => undefined
      })
    )

    result.current.handleCommitAction('copy-full-source', a, [a, b])
    await vi.waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledTimes(1))

    expect(mocks.getRuntimeGitCommitDiff).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/repo' }),
      expect.objectContaining({ commitOid: a.id, parentOid: PARENT, filePath: 'a.txt' })
    )
    const payload = String(mocks.writeClipboardText.mock.calls[0]?.[0])
    expect(payload).toContain('content of a.txt')
    expect(payload).toContain('content of b.txt')
  })

  it('copies only the right-clicked file of an expanded commit', async () => {
    vi.stubGlobal('window', {
      ...window,
      api: { ui: { writeClipboardText: mocks.writeClipboardText } }
    })
    mocks.getRuntimeGitCommitDiff.mockImplementation(async (_ctx, args) => ({
      kind: 'text',
      originalContent: 'old',
      modifiedContent: `content of ${args.filePath}`,
      originalIsBinary: false,
      modifiedIsBinary: false
    }))
    const { result } = renderHook(() =>
      useGitHistoryCommitActions({
        activeWorktreeId: 'wt-1',
        editorWorktreeId: 'wt-1',
        worktreePath: '/repo',
        activeRepoTarget: { kind: 'local' },
        resolveSplitTargetGroupId: () => undefined
      })
    )

    result.current.copyCommitFileFullSource(item('a', 2000), {
      path: 'src/one.ts',
      status: 'modified'
    })
    await vi.waitFor(() => expect(mocks.writeClipboardText).toHaveBeenCalledTimes(1))

    expect(mocks.getRuntimeGitCommitCompare).not.toHaveBeenCalled()
    expect(mocks.getRuntimeGitCommitDiff).toHaveBeenCalledTimes(1)
    expect(String(mocks.writeClipboardText.mock.calls[0]?.[0])).toContain('content of src/one.ts')
  })
})
