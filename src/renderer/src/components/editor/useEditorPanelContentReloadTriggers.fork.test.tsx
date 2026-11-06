// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { GitStatusEntry } from '../../../../shared/git/status/git-status-types'
import { folderFile, seedFolderGitOwner } from './folder-git-owner.test-fixture'
import { useEditorPanelContentReloadTriggers } from './useEditorPanelContentReloadTriggers'

beforeEach(seedFolderGitOwner)

const entry = (area: GitStatusEntry['area']): GitStatusEntry => ({
  path: 'src/a.ts',
  status: 'modified',
  area
})

it('reloads a folder Changes tab when its repo-relative git status changes', () => {
  const activeFile = folderFile({ mode: 'edit' })
  const loadDiffContent = vi.fn(async () => {})
  const params = {
    activeFile,
    isChangesMode: true,
    diffContentsRef: { current: { [activeFile.id]: { kind: 'text' as const } } },
    isVisibleRef: { current: true },
    openFilesRef: { current: [activeFile] },
    invalidateDiffContent: vi.fn(),
    invalidateFileContent: vi.fn(),
    loadDiffContent,
    loadFileContent: vi.fn(async () => {})
  }
  const { rerender } = renderHook(
    (gitStatusEntries: GitStatusEntry[]) =>
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook only reads the cached entry's isStale.
      useEditorPanelContentReloadTriggers({ ...params, gitStatusEntries } as never),
    { initialProps: [entry('staged')] }
  )
  const before = loadDiffContent.mock.calls.length
  rerender([])
  expect(loadDiffContent.mock.calls.length).toBe(before + 1)
})
