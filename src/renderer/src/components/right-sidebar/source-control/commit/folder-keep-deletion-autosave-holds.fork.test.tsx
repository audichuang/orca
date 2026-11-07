// @vitest-environment happy-dom
// Fork seam guard: keep_deletion in a folder workspace holds autosave on the repo and folder owners.
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorPathMutationTarget } from '@/components/editor/autosave/editor-autosave'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'

const mocks = vi.hoisted(() => {
  const events: string[] = []
  return {
    events,
    quiesce: vi.fn<(target: EditorPathMutationTarget) => Promise<() => void>>(),
    notify: vi.fn<(target: EditorPathMutationTarget) => void>(),
    resolve: vi.fn<() => Promise<void>>()
  }
})
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))
vi.mock('@/components/editor/autosave/editor-autosave', () => ({
  requestEditorSaveQuiesce: mocks.quiesce,
  notifyEditorExternalFileChange: mocks.notify,
  requestEditorFileSave: vi.fn()
}))
vi.mock('@/runtime/runtime-git-working-tree-client', () => ({
  resolveRuntimeGitConflict: mocks.resolve,
  discardRuntimeGitPath: vi.fn(),
  bulkDiscardRuntimeGitPaths: vi.fn(),
  stageRuntimeGitPath: vi.fn(),
  unstageRuntimeGitPath: vi.fn(),
  bulkUnstageRuntimeGitPaths: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => undefined, {
    getState: () => ({ trackConflictPath: vi.fn() })
  })
}))
vi.mock('./source-control-entry-failure-toast', () => ({
  dismissSourceControlEntryFailureToast: vi.fn(),
  showSourceControlEntryFailureToast: vi.fn()
}))
import { useSourceControlEntryMutations } from './use-entry-mutations'

const FOLDER_SCOPE = { gitWorktreeId: 'repo-wt', editorWorktreeId: 'folder:fw-1' }
const ENTRY: GitStatusEntry = {
  path: 'a.ts',
  status: 'deleted',
  area: 'unstaged',
  conflictKind: 'deleted_by_us',
  conflictStatus: 'unresolved'
}
const RELEASES = ['folder:fw-1', 'repo-wt'].map((owner) => `release ${owner} a.ts`)

function renderFolderMutations() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SourceControlWorktreeScopeContext.Provider value={FOLDER_SCOPE}>
      {children}
    </SourceControlWorktreeScopeContext.Provider>
  )
  return renderHook(
    () =>
      useSourceControlEntryMutations({
        activeRepoTarget: runtimeTargetForOwnerEnvironment(null),
        activeWorktreeId: 'repo-wt',
        worktreePath: '/f/repo',
        refreshActiveGitStatusAfterMutation: async () => {}
      }),
    { wrapper }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.events.length = 0
  mocks.quiesce.mockImplementation(
    async (target) => () =>
      void mocks.events.push(`release ${target.worktreeId} ${target.relativePath}`)
  )
  mocks.notify.mockImplementation((target) =>
    mocks.events.push(`notify ${target.worktreeId} ${target.relativePath}`)
  )
  mocks.resolve.mockImplementation(async () => void mocks.events.push('git'))
})

describe('folder workspace keep_deletion conflict resolution', () => {
  it('holds repo and folder owners, notifies both tabs, and releases after git finishes', async () => {
    const { result } = renderFolderMutations()
    await act(() => result.current.handleResolveConflict(ENTRY, 'keep_deletion'))

    expect(mocks.quiesce.mock.calls.map(([t]) => t.worktreeId).sort()).toEqual([
      'folder:fw-1',
      'repo-wt'
    ])
    expect(mocks.events[0]).toBe('git')
    expect(mocks.events.slice(1).sort()).toEqual(
      [...RELEASES, 'notify folder:fw-1 a.ts', 'notify repo-wt a.ts'].sort()
    )
    // Notifications land before any hold is released.
    const lastNotify = Math.max(...mocks.events.map((e, i) => (e.startsWith('notify') ? i : -1)))
    const firstRelease = mocks.events.findIndex((e) => e.startsWith('release'))
    expect(lastNotify).toBeLessThan(firstRelease)
  })

  it('keeps every hold while git is still running', async () => {
    let finishGit = (): void => {}
    mocks.resolve.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          mocks.events.push('git')
          finishGit = resolve
        })
    )
    const { result } = renderFolderMutations()

    let pending: Promise<void> = Promise.resolve()
    await act(async () => {
      pending = result.current.handleResolveConflict(ENTRY, 'keep_deletion')
      await vi.waitFor(() => expect(mocks.resolve).toHaveBeenCalled())
    })
    expect(mocks.quiesce).toHaveBeenCalledTimes(2)
    expect(mocks.events).toEqual(['git'])

    await act(async () => {
      finishGit()
      await pending
    })
    expect(mocks.events.filter((e) => e.startsWith('release')).sort()).toEqual(RELEASES)
  })

  it('releases every hold when git fails', async () => {
    mocks.resolve.mockRejectedValueOnce(new Error('git failed'))
    const { result } = renderFolderMutations()
    await act(() => result.current.handleResolveConflict(ENTRY, 'keep_deletion'))

    expect(mocks.events.filter((e) => e.startsWith('release')).sort()).toEqual(RELEASES)
    expect(mocks.events.some((e) => e.startsWith('notify'))).toBe(false)
  })
})
