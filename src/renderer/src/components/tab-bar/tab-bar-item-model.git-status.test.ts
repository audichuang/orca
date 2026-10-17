import { describe, expect, it, afterEach, vi } from 'vitest'
import type { GitFileStatus } from '../../../../shared/git-status-types'
import { resolveEditorTabGitStatus } from './tab-bar-item-model'
import { buildEditorTabGitStatusMap } from './editor-tab-git-status'

const statusByRelativePath = new Map<string, GitFileStatus>([['index.html', 'modified']])

describe('resolveEditorTabGitStatus', () => {
  it('decorates a file tab from its workspace path', () => {
    expect(
      resolveEditorTabGitStatus({ mode: 'edit', relativePath: 'index.html' }, statusByRelativePath)
    ).toBe('modified')
  })

  it.each(['check-details'] as const)(
    'never decorates a %s tab whose title matches a changed file',
    (mode) => {
      expect(
        resolveEditorTabGitStatus({ mode, relativePath: 'index.html' }, statusByRelativePath)
      ).toBeNull()
    }
  )

  it('decorates folder-workspace tabs from their own repo, not a same-named file elsewhere', () => {
    const map = buildEditorTabGitStatusMap([], {
      web: [{ path: 'README.md', status: 'modified', area: 'unstaged' }],
      api: [{ path: 'README.md', status: 'deleted', area: 'unstaged' }]
    })
    const tab = (gitWorktreeId: string) => ({
      mode: 'edit' as const,
      relativePath: 'README.md',
      worktreeId: 'folder:f1',
      gitWorktreeId
    })
    expect(resolveEditorTabGitStatus(tab('web'), map)).toBe('modified')
    expect(resolveEditorTabGitStatus(tab('api'), map)).toBe('deleted')
    expect(resolveEditorTabGitStatus(tab('core'), map)).toBeNull()
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
