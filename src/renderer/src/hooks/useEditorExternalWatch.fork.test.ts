import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import type * as EditorAutosaveModule from '@/components/editor/editor-autosave'

vi.mock('@/store', () => ({
  useAppStore: {
    getState: vi.fn()
  }
}))
// Why: the node environment has no window; stub the two editor-autosave exports the handler uses.
vi.mock('@/components/editor/editor-autosave', async (importOriginal) => {
  const actual = await importOriginal<typeof EditorAutosaveModule>()
  return {
    ...actual,
    notifyEditorExternalFileChange: vi.fn(),
    getOpenFilesForExternalFileChange: vi.fn(() => [])
  }
})

import { buildEditorExternalWatchEventHandler as createExternalWatchEventHandler } from './editor-external-watch-event-reconciliation'
import { useAppStore } from '@/store'
import {
  getOpenFilesForExternalFileChange,
  notifyEditorExternalFileChange
} from '@/components/editor/editor-autosave'

describe('createExternalWatchEventHandler for workspaces sharing a root', () => {
  const setExternalMutation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reloads tabs in every workspace that watches the same root', () => {
    const tab = (worktreeId: string) => ({
      id: `file-${worktreeId}`,
      worktreeId,
      filePath: '/shared/notes.md',
      relativePath: 'notes.md',
      mode: 'edit' as const,
      isDirty: false
    })
    const files = [tab('folder:a'), tab('folder:b')]
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only openFiles and setExternalMutation.
    vi.mocked(useAppStore.getState).mockReturnValue({
      openFiles: files,
      setExternalMutation
    } as never)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the reload path reads only the tab fields built above.
    vi.mocked(getOpenFilesForExternalFileChange).mockReturnValue(files as never)
    const target = (worktreeId: string) => ({
      worktreeId,
      worktreePath: '/shared',
      connectionId: undefined,
      runtimeEnvironmentId: null
    })
    const { handleFsChanged, dispose } = createExternalWatchEventHandler(() => [
      target('folder:a'),
      target('folder:b')
    ])

    handleFsChanged({
      worktreePath: '/shared',
      events: [{ kind: 'update', absolutePath: '/shared/notes.md', isDirectory: false }]
    })
    vi.advanceTimersByTime(100)

    for (const worktreeId of ['folder:a', 'folder:b']) {
      expect(notifyEditorExternalFileChange).toHaveBeenCalledWith(
        expect.objectContaining({ worktreeId, relativePath: 'notes.md' })
      )
    }
    dispose()
  })
})
