import { describe, expect, it } from 'vitest'
import type { AppState } from '../../../types'
import { resolveTabOwnerRelativePath } from './untitled-file-cleanup'

const state: Pick<AppState, 'folderWorkspaces'> = {
  folderWorkspaces: [
    {
      id: 'f1',
      projectGroupId: 'g1',
      name: 'docs',
      folderPath: '/repo/docs',
      connectionId: null,
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      createdAt: 0,
      lastActivityAt: 0,
      updatedAt: 0
    }
  ]
}

describe('resolveTabOwnerRelativePath', () => {
  it('keeps relativePath for tabs without a separate git owner', () => {
    const file = {
      worktreeId: 'folder:f1',
      filePath: '/repo/docs/n.md',
      relativePath: 'n.md'
    }
    expect(resolveTabOwnerRelativePath(state, file, null)).toBe('n.md')
  })

  it('re-derives a folder-relative path for a repo-relative git-owned tab', () => {
    const file = {
      worktreeId: 'folder:f1',
      gitWorktreeId: 'repo-main',
      filePath: '/repo/docs/untitled.md',
      relativePath: 'docs/untitled.md'
    }
    expect(resolveTabOwnerRelativePath(state, file, null)).toBe('untitled.md')
  })

  it('refuses a path it cannot place under the owner root', () => {
    const file = {
      worktreeId: 'folder:missing',
      gitWorktreeId: 'repo-main',
      filePath: '/repo/docs/untitled.md',
      relativePath: 'docs/untitled.md'
    }
    expect(resolveTabOwnerRelativePath(state, file, null)).toBeNull()
  })
})
