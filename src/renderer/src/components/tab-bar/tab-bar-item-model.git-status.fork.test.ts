import { describe, expect, it, afterEach, vi } from 'vitest'
import {
  buildTabStripLayoutKey,
  resolveEditorTabGitStatus,
  type TabBarItem
} from './tab-bar-item-model'
import { buildEditorTabGitStatusMap } from './editor-tab-git-status'

describe('resolveEditorTabGitStatus in a folder workspace', () => {
  it('decorates folder-workspace tabs from their own repo, not a same-named file elsewhere', () => {
    const map = buildEditorTabGitStatusMap(
      [],
      {
        web: [{ path: 'README.md', status: 'modified', area: 'unstaged' }],
        api: [{ path: 'README.md', status: 'deleted', area: 'unstaged' }]
      },
      { web: '/f/web', api: '/f/api' }
    )
    const tab = (gitWorktreeId: string) => ({
      mode: 'edit' as const,
      relativePath: 'README.md',
      filePath: `/f/${gitWorktreeId}/README.md`,
      worktreeId: 'folder:f1',
      gitWorktreeId
    })
    expect(resolveEditorTabGitStatus(tab('web'), map)).toBe('modified')
    expect(resolveEditorTabGitStatus(tab('api'), map)).toBe('deleted')
    expect(resolveEditorTabGitStatus(tab('core'), map)).toBeNull()
  })
})

describe('buildTabStripLayoutKey in a folder workspace', () => {
  it("re-keys the strip when a folder-workspace tab's own repo status changes", () => {
    const item: TabBarItem = {
      type: 'editor',
      id: '/f/web/README.md',
      unifiedTabId: 'tab-1',
      isPinned: false,
      data: {
        id: '/f/web/README.md',
        mode: 'edit',
        filePath: '/f/web/README.md',
        relativePath: 'README.md',
        worktreeId: 'folder:f1',
        gitWorktreeId: 'web',
        language: 'markdown',
        isDirty: false
      }
    }
    const keyFor = (status: 'modified' | 'deleted') =>
      buildTabStripLayoutKey(
        [item],
        false,
        {},
        buildEditorTabGitStatusMap(
          [],
          { web: [{ path: 'README.md', status, area: 'unstaged' }] },
          { web: '/f/web' }
        ),
        new Map()
      )
    expect(keyFor('modified')).not.toBe(keyFor('deleted'))
  })
})

const { rejectAppStoreAccess } = vi.hoisted(() => ({
  rejectAppStoreAccess: vi.fn(() => {
    throw new Error('Pure helper tests must not access the app store')
  })
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(rejectAppStoreAccess, {
    getState: rejectAppStoreAccess,
    getInitialState: rejectAppStoreAccess,
    setState: rejectAppStoreAccess,
    subscribe: rejectAppStoreAccess
  })
}))

afterEach(() => {
  expect(rejectAppStoreAccess).not.toHaveBeenCalled()
})
