import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORCA_EDITOR_FILE_SAVED_EVENT, type EditorFileSavedDetail } from './editor-autosave'
import { createEditorSaveQueue } from './editor-save-queue'
import {
  createEditorStore,
  createFakeEditorDisk,
  stubEditorWindowWithDisk,
  withLoadedBaselines
} from './editor-autosave-controller-test-fixture'
import { CLOSED_VIEW_PATH, createClosedViewHarness } from './editor-save-closed-view.test-fixture'

// Fork contract: folder Source Control (use-folder-repo-status-refresh) resolves the saved file from
// detail.filePath, falling back to openFiles.find(f => f.id === detail.fileId). Pins the producer.
afterEach(() => vi.unstubAllGlobals())

describe('ORCA_EDITOR_FILE_SAVED_EVENT producer', () => {
  it('fires after a real save with a fileId that names an open file', async () => {
    const disk = stubEditorWindowWithDisk(createFakeEditorDisk({ '/work/core/a.ts': 'prev' }))
    const store = createEditorStore()
    store.getState().openFile({
      filePath: '/work/core/a.ts',
      relativePath: 'a.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      mode: 'edit'
    })
    // Why: saves with no known disk version are refused, so the tab needs the baseline a load stamps.
    withLoadedBaselines(store, disk)
    const file = store.getState().openFiles.find((f) => f.filePath === '/work/core/a.ts')!
    store.getState().setEditorDraft(file.id, 'next')
    store.getState().markFileDirty(file.id, true)
    const seen: Partial<EditorFileSavedDetail>[] = []
    window.addEventListener(ORCA_EDITOR_FILE_SAVED_EVENT, (event) => {
      if (event instanceof CustomEvent) {
        seen.push(event.detail)
      }
    })
    const queue = createEditorSaveQueue(store)
    await queue.queueSave(
      store.getState().openFiles.find((f) => f.id === file.id)!,
      'next',
      'user'
    )
    expect(seen).toHaveLength(1)
    expect(store.getState().openFiles.some((f) => f.id === seen[0]?.fileId)).toBe(true)
    expect(seen[0]?.filePath).toBe('/work/core/a.ts')
    queue.dispose()
  })

  it('names the written path when every view of the file closed before the write landed', async () => {
    const h = createClosedViewHarness()
    try {
      const seen: Partial<EditorFileSavedDetail>[] = []
      const onSaved = (event: Event): void => {
        if (event instanceof CustomEvent) {
          seen.push(event.detail)
        }
      }
      window.addEventListener(ORCA_EDITOR_FILE_SAVED_EVENT, onSaved)
      h.type('A', 'edit')
      h.holdNextWrite()
      const saved = h.queue.queueSave(h.view('A'), 'edit')
      await vi.advanceTimersByTimeAsync(0)
      h.closeView('A')
      h.closeView('B')
      h.release()
      await expect(saved).resolves.toBe('written')
      window.removeEventListener(ORCA_EDITOR_FILE_SAVED_EVENT, onSaved)
      expect(seen).toHaveLength(1)
      expect(h.store.getState().openFiles.some((f) => f.id === seen[0]?.fileId)).toBe(false)
      expect(seen[0]?.filePath).toBe(CLOSED_VIEW_PATH)
    } finally {
      h.dispose()
    }
  })
})
