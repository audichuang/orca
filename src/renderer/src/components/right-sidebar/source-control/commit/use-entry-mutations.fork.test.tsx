// @vitest-environment happy-dom
// Fork seam guard: a discard in a folder repo section tells the folder's tabs the file changed, even a tab
// opened before the repo was known (so it has no git owner). Real store; only window.api.git is stubbed.
import { toast } from 'sonner'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getOpenFilesForExternalFileChange,
  ORCA_EDITOR_EXTERNAL_FILE_CHANGE_EVENT,
  type EditorPathMutationTarget
} from '@/components/editor/editor-autosave'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import { useAppStore } from '@/store'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'
import { useSourceControlEntryMutations } from './use-entry-mutations'

const FOLDER = 'folder:fw-1'
const REPO = 'repo-wt'
const FOLDER_SCOPE = { gitWorktreeId: REPO, editorWorktreeId: FOLDER }

let notifiedTabIds: Set<string>
function recordNotifiedTabs(event: Event): void {
  if (!(event instanceof CustomEvent)) {
    return
  }
  const state = useAppStore.getState()
  const target: EditorPathMutationTarget = event.detail
  for (const file of getOpenFilesForExternalFileChange(state.openFiles, target)) {
    notifiedTabIds.add(file.id)
  }
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      git: {
        stage: vi.fn(async () => {
          throw new Error('index.lock exists')
        }),
        discard: vi.fn(async () => {}),
        bulkDiscard: vi.fn(async () => {})
      }
    }
  })
  notifiedTabIds = new Set()
  window.addEventListener(ORCA_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, recordNotifiedTabs)
})
afterEach(() => {
  window.removeEventListener(ORCA_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, recordNotifiedTabs)
  Reflect.deleteProperty(window, 'api')
})

function openFolderTab(relativePath: string): string {
  useAppStore.getState().openFile({
    filePath: `/f/repo/${relativePath}`,
    relativePath: `repo/${relativePath}`,
    worktreeId: FOLDER,
    language: 'typescript',
    mode: 'edit'
  })
  const tab = useAppStore.getState().openFiles.find((f) => f.filePath === `/f/repo/${relativePath}`)
  expect(tab?.gitWorktreeId).toBeUndefined()
  return tab?.id ?? ''
}

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
        activeWorktreeId: REPO,
        worktreePath: '/f/repo',
        refreshActiveGitStatusAfterMutation: async () => {}
      }),
    { wrapper }
  )
}

describe.each([false, true])('folder repo section discard (bulk: %s, fork)', (bulk) => {
  it("notifies the folder's tabs of the discarded files", async () => {
    const paths = bulk ? ['a.ts', 'b.ts'] : ['a.ts']
    const tabIds = paths.map(openFolderTab)
    const { result } = renderFolderMutations()

    await act(() =>
      bulk ? result.current.discardMany(paths) : result.current.discardSingle(paths[0])
    )

    expect([...notifiedTabIds].sort()).toEqual([...tabIds].sort())
  })
})

function retryAction() {
  const notification = toast.getToasts().find((item) => item.id === 'source-control-entry-mutation')
  return notification && 'action' in notification ? notification.action : undefined
}

it('keeps Retry available for a stage failure after moving the repo section to another folder', async () => {
  const args = {
    activeRepoTarget: runtimeTargetForOwnerEnvironment(null),
    activeWorktreeId: REPO,
    worktreePath: '/f/repo',
    refreshActiveGitStatusAfterMutation: async () => {}
  }
  let scope = FOLDER_SCOPE
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SourceControlWorktreeScopeContext.Provider value={scope}>
      {children}
    </SourceControlWorktreeScopeContext.Provider>
  )
  const { result, rerender } = renderHook(() => useSourceControlEntryMutations(args), { wrapper })
  scope = { ...FOLDER_SCOPE, editorWorktreeId: 'folder:other-folder' }
  useAppStore.setState({ activeWorktreeId: scope.editorWorktreeId })
  rerender()
  await act(() => result.current.handleStage('a.ts'))
  expect(retryAction()).toEqual(expect.objectContaining({ label: 'Retry' }))
})

it('notifies the new folder after a discard callback survives a scope change', async () => {
  const args = {
    activeRepoTarget: runtimeTargetForOwnerEnvironment(null),
    activeWorktreeId: REPO,
    worktreePath: '/f/repo',
    refreshActiveGitStatusAfterMutation: async () => {}
  }
  let scope = FOLDER_SCOPE
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SourceControlWorktreeScopeContext.Provider value={scope}>
      {children}
    </SourceControlWorktreeScopeContext.Provider>
  )
  const { result, rerender } = renderHook(() => useSourceControlEntryMutations(args), { wrapper })
  scope = { ...FOLDER_SCOPE, editorWorktreeId: 'folder:other-folder' }
  useAppStore.getState().openFile({
    filePath: '/f/repo/a.ts',
    relativePath: 'repo/a.ts',
    worktreeId: scope.editorWorktreeId,
    language: 'typescript',
    mode: 'edit'
  })
  const id = useAppStore.getState().openFiles[0]?.id
  rerender()
  await act(() => result.current.discardSingle('a.ts'))
  expect([...notifiedTabIds]).toEqual([id])
})
