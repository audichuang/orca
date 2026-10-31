// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  BRANCH,
  COMMIT,
  FOLDER,
  REPO,
  ROOT,
  folderFile,
  seedFolderGitOwner
} from '../../folder-git-owner.test-fixture'
import type { DiffSection } from '../../diff-section-types'
import { useCombinedDiffSectionActions } from './use-combined-diff-section-actions'

beforeEach(seedFolderGitOwner)
afterEach(cleanup)

it.each(['edit', 'branch', 'commit'] as const)(
  'opens a combined %s section under the current repo after owner discovery',
  (mode) => {
    const sections: DiffSection[] = [
      {
        key: 'src/a.ts',
        path: 'src/a.ts',
        status: 'modified',
        area: 'unstaged',
        originalContent: 'before',
        modifiedContent: 'after',
        collapsed: false,
        loading: false,
        dirty: false,
        diffResult: null,
        largeDiffRenderLimit: null
      }
    ]
    const params = {
      activeGroupId: undefined,
      branchCompare: BRANCH,
      commitCompare: COMMIT,
      canOpenWorkspaceFileBrowserForPath: () => false,
      isAllMode: false,
      isBranchMode: mode === 'branch',
      isCommitMode: mode === 'commit',
      sections,
      sectionsRef: { current: sections },
      setSectionHeights: vi.fn(),
      setSections: vi.fn()
    }
    const { result, rerender } = renderHook(
      ({ file }) => useCombinedDiffSectionActions({ ...params, file }),
      {
        initialProps: { file: folderFile({ filePath: ROOT, gitWorktreeId: undefined }) }
      }
    )
    rerender({ file: folderFile({ filePath: ROOT }) })
    act(() => useAppStore.setState({ repos: [], worktreesByRepo: {} }))
    act(() => result.current.openSection(0))
    expect(useAppStore.getState().openFiles).toEqual([
      expect.objectContaining({
        mode: mode === 'edit' ? 'edit' : 'diff',
        worktreeId: FOLDER,
        gitWorktreeId: REPO,
        filePath: `${ROOT}/src/a.ts`
      })
    ])
  }
)
