// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  FOLDER,
  REPO,
  folderFile,
  seedFolderGitOwner
} from '../editor/folder-git-owner.test-fixture'
import { useTabBarRuntimeModel } from './use-tab-bar-runtime-model'
import {
  buildTabStripLayoutKey,
  resolveEditorTabGitStatus,
  type TabBarItem
} from './tab-bar-item-model'

afterEach(cleanup)
it('updates the folder tab badge and strip layout when its own repo status changes', () => {
  seedFolderGitOwner()
  useAppStore.setState((s) => ({
    folderWorkspaces: s.folderWorkspaces.map((folder) => ({
      ...folder,
      executionHostId: 'local' as const
    })),
    openFiles: [folderFile({ mode: 'edit' })],
    gitStatusByWorktree: { [REPO]: [{ path: 'src/a.ts', status: 'modified', area: 'unstaged' }] }
  }))
  const item: TabBarItem = {
    type: 'editor',
    id: 'folder-file',
    unifiedTabId: 'tab',
    isPinned: false,
    data: folderFile({ mode: 'edit' })
  }
  const { result } = renderHook(() => useTabBarRuntimeModel({ worktreeId: FOLDER }))
  const key = () =>
    buildTabStripLayoutKey([item], false, {}, result.current.statusByRelativePath, new Map())
  const before = key()
  expect(resolveEditorTabGitStatus(item.data, result.current.statusByRelativePath)).toBe('modified')
  act(() =>
    useAppStore.setState({
      gitStatusByWorktree: { [REPO]: [{ path: 'src/a.ts', status: 'deleted', area: 'unstaged' }] }
    })
  )
  expect(resolveEditorTabGitStatus(item.data, result.current.statusByRelativePath)).toBe('deleted')
  expect(key()).not.toBe(before)
})
