// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ORCA_EDITOR_EXTERNAL_FILE_CHANGE_EVENT } from '../../editor-autosave'
import { REPO, ROOT, folderFile } from '../../folder-git-owner.test-fixture'
import { getCombinedDiffFileTreeSectionKey } from '../resolve-changes/combined-diff-section-identity'
import { useCombinedDiffSectionRevalidation } from './use-combined-diff-section-revalidation'

afterEach(cleanup)
it('reloads a mounted folder section on a write from its newly discovered repo owner', () => {
  const requestSectionReload = vi.fn()
  const entry = { path: 'src/a.ts', status: 'modified' as const, area: 'unstaged' as const }
  const params = {
    gitStatusEntries: [],
    registry: {
      loadedIndicesRef: { current: new Set([0]) },
      loadingIndicesRef: { current: new Set<number>() }
    },
    requestSectionReload,
    sectionEntries: [entry],
    shouldAutoReloadFromGitStatus: false,
    treeMode: 'uncommitted' as const,
    sectionIndexByKeyRef: {
      current: new Map([[getCombinedDiffFileTreeSectionKey('uncommitted', entry), 0]])
    }
  }
  const { rerender } = renderHook(
    ({ file }) => useCombinedDiffSectionRevalidation({ ...params, file }),
    {
      initialProps: { file: folderFile({ filePath: ROOT, gitWorktreeId: undefined }) }
    }
  )
  rerender({ file: folderFile({ filePath: ROOT }) })
  act(() =>
    window.dispatchEvent(
      new CustomEvent(ORCA_EDITOR_EXTERNAL_FILE_CHANGE_EVENT, {
        detail: { worktreeId: REPO, worktreePath: ROOT, relativePath: 'src/a.ts' }
      })
    )
  )
  expect(requestSectionReload.mock.calls).toEqual([[0]])
})
