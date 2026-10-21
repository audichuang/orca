// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorPathMutationTarget } from '@/components/editor/editor-autosave'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'

const mocks = vi.hoisted(() => {
  const events: string[] = []
  return {
    events,
    quiesce: vi.fn<(target: EditorPathMutationTarget) => Promise<() => void>>(),
    notify: vi.fn(),
    discard: vi.fn<() => Promise<void>>(),
    bulkDiscard: vi.fn<() => Promise<void>>()
  }
})
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))
vi.mock('@/components/editor/editor-autosave', () => ({
  requestEditorSaveQuiesce: mocks.quiesce,
  notifyEditorExternalFileChange: mocks.notify
}))
vi.mock('@/runtime/runtime-git-working-tree-client', () => ({
  discardRuntimeGitPath: mocks.discard,
  bulkDiscardRuntimeGitPaths: mocks.bulkDiscard,
  stageRuntimeGitPath: vi.fn(),
  unstageRuntimeGitPath: vi.fn(),
  bulkUnstageRuntimeGitPaths: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => undefined, {
    getState: () => ({ settings: { activeRuntimeEnvironmentId: null } })
  })
}))
import { useSourceControlEntryMutations } from './use-entry-mutations'

const FOLDER_SCOPE = { gitWorktreeId: 'repo-wt', editorWorktreeId: 'folder:fw-1' }

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

function holdFor(target: EditorPathMutationTarget): () => void {
  return () => mocks.events.push(`release ${target.worktreeId} ${target.relativePath}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.events.length = 0
  mocks.quiesce.mockImplementation(async (target) => holdFor(target))
  mocks.discard.mockImplementation(async () => void mocks.events.push('git'))
  mocks.bulkDiscard.mockImplementation(async () => void mocks.events.push('git'))
})

describe.each([false, true])('folder workspace discard (bulk: %s)', (bulk) => {
  const paths = bulk ? ['a.ts', 'b.ts'] : ['a.ts']
  const run = (result: ReturnType<typeof renderFolderMutations>['result']) =>
    bulk ? result.current.discardMany(paths) : result.current.discardSingle(paths[0])
  const releases = ['repo-wt', 'folder:fw-1'].flatMap((owner) =>
    paths.map((p) => `release ${owner} ${p}`)
  )

  it('releases the repo and folder holds once, after git finishes', async () => {
    const { result } = renderFolderMutations()
    await act(() => run(result))

    expect(mocks.events[0]).toBe('git')
    expect(mocks.events.slice(1).sort()).toEqual([...releases].sort())
  })

  it('keeps every hold while git is still running', async () => {
    let finishGit = (): void => {}
    const gitMock = bulk ? mocks.bulkDiscard : mocks.discard
    gitMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          mocks.events.push('git')
          finishGit = resolve
        })
    )
    const { result } = renderFolderMutations()

    let pending: Promise<void> = Promise.resolve()
    await act(async () => {
      pending = run(result)
      await vi.waitFor(() => expect(gitMock).toHaveBeenCalled())
    })
    expect(mocks.events).toEqual(['git'])

    await act(async () => {
      finishGit()
      await pending
    })
    expect(mocks.events.slice(1).sort()).toEqual([...releases].sort())
  })

  it('releases every hold when git fails', async () => {
    const gitMock = bulk ? mocks.bulkDiscard : mocks.discard
    gitMock.mockRejectedValueOnce(new Error('git failed'))
    const { result } = renderFolderMutations()

    await act(() => expect(run(result)).rejects.toThrow('git failed'))

    expect(mocks.events.sort()).toEqual([...releases].sort())
  })

  it('frees the holds already taken and skips git when one owner cannot be quiesced', async () => {
    mocks.quiesce.mockImplementation(async (target) => {
      if (target.worktreeId === 'folder:fw-1') {
        throw new Error('save refused')
      }
      return holdFor(target)
    })
    const { result } = renderFolderMutations()

    await act(() => expect(run(result)).rejects.toThrow('save refused'))

    expect(mocks.events.sort()).toEqual(paths.map((p) => `release repo-wt ${p}`).sort())
  })
})
