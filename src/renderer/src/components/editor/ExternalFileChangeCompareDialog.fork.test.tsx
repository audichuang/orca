// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  REPO,
  folderFile,
  installFolderRuntime,
  seedFolderGitOwner
} from './folder-git-owner.test-fixture'
import { ExternalFileChangeCompareDialog } from './ExternalFileChangeCompareDialog'

vi.mock('@monaco-editor/react', () => ({ DiffEditor: () => null }))
afterEach(cleanup)

it('re-reads the disk comparison with the repo address when a mounted tab discovers its git owner', async () => {
  seedFolderGitOwner()
  const runtime = installFolderRuntime()
  const props = {
    currentContent: 'draft',
    open: true,
    onOpenChange: vi.fn(),
    onReload: vi.fn(),
    onKeepEdits: vi.fn()
  }
  const file = folderFile({ mode: 'edit', gitWorktreeId: undefined })
  const view = render(<ExternalFileChangeCompareDialog {...props} file={file} />)
  try {
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith(expect.objectContaining({ method: 'files.read' }))
    )
    runtime.call.mockClear()
    view.rerender(
      <ExternalFileChangeCompareDialog {...props} file={{ ...file, gitWorktreeId: REPO }} />
    )
    await waitFor(() =>
      expect(runtime.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'files.read',
          params: { worktree: `id:${REPO}`, relativePath: 'src/a.ts' }
        })
      )
    )
  } finally {
    view.unmount()
    runtime.restore()
  }
})
