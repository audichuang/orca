// @vitest-environment happy-dom
import { cleanup, renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  BRANCH,
  COMMIT,
  REPO,
  folderFile,
  installFolderRuntime,
  seedFolderGitOwner
} from './folder-git-owner.test-fixture'
import { useEditorPanelDiffContentLoader } from './useEditorPanelDiffContentLoader'
import type { DiffContent } from './editor-panel-content-types'

let runtime: ReturnType<typeof installFolderRuntime>
beforeEach(() => {
  seedFolderGitOwner()
  runtime = installFolderRuntime()
})
afterEach(() => {
  cleanup()
  runtime.restore()
})

it.each(['branch', 'commit'] as const)(
  'loads a folder-relative %s tab using the repo selector and repo-relative path',
  async (diffSource) => {
    let contents: Record<string, DiffContent> = {}
    const { result } = renderHook(() =>
      useEditorPanelDiffContentLoader({
        diffReadGenerationCounterRef: { current: 0 },
        diffReadGenerationRef: { current: {} },
        outstandingDiffReadsRef: { current: {} },
        setDiffContents: (update) => {
          contents = typeof update === 'function' ? update(contents) : update
        }
      })
    )
    await act(() =>
      result.current(folderFile({ diffSource, branchCompare: BRANCH, commitCompare: COMMIT }))
    )
    expect(runtime.call).toHaveBeenCalledWith(
      expect.objectContaining({
        method: diffSource === 'branch' ? 'git.branchDiff' : 'git.commitDiff',
        params: expect.objectContaining({ worktree: `id:${REPO}`, filePath: 'src/a.ts' })
      })
    )
    expect(contents['folder-file']?.modifiedContent).toBe('after')
  }
)
