// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  FOLDER,
  folderFile,
  installFolderRuntime,
  seedFolderGitOwner
} from '@/components/editor/folder-git-owner.test-fixture'
import { deleteUntouchedUntitledFile } from './untitled-file-cleanup'

afterEach(() => vi.restoreAllMocks())
it('deletes an untouched repo-relative placeholder through the folder-relative server address', async () => {
  seedFolderGitOwner()
  const runtime = installFolderRuntime()
  try {
    deleteUntouchedUntitledFile(
      useAppStore.getState,
      folderFile({ relativePath: 'src/a.ts', mode: 'edit', isUntitled: true })
    )
    await vi.waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'files.delete',
          params: expect.objectContaining({
            worktree: `id:${FOLDER}`,
            relativePath: 'repo-a/src/a.ts'
          })
        })
      )
    )
  } finally {
    runtime.restore()
  }
})
