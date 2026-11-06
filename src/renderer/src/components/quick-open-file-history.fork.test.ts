import { expect, it, vi } from 'vitest'

vi.mock('@/lib/worktree-operation-route', () => ({
  resolveWorktreeOperationRoute: () => ({ executionHostId: 'local', runtimeEnvironmentId: null })
}))

import {
  quickOpenHistoryScope,
  readQuickOpenHistory,
  recordQuickOpenFileVisit
} from '@/lib/quick-open-file-history'
import { withFolderFileGitOwner } from '@/store/slices/editor/git/folder-file-git-owner'
import type { AppState } from '@/store/types'
import type { OpenFile } from '@/store/slices/editor/types/open-file'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the fields the git-owner resolver and history lookup read.
const state = {
  folderWorkspaces: [{ id: 'f1', folderPath: '/p', connectionId: null }],
  repos: [{ id: 'web', path: '/p/web', displayName: 'web', badgeColor: '', addedAt: 0 }],
  worktreesByRepo: {
    web: [{ id: 'web-main', repoId: 'web', path: '/p/web', isMainWorktree: true }]
  },
  getKnownWorktreeById: () => ({ path: '/p' })
} as unknown as AppState

it('records a repo-bound folder tab under the folder-relative path quick open lists', () => {
  const explorerOpen: OpenFile = {
    id: '/p/web/README.md',
    filePath: '/p/web/README.md',
    relativePath: 'web/README.md',
    worktreeId: 'folder:f1',
    language: 'markdown',
    isDirty: false,
    mode: 'edit'
  }
  const file = withFolderFileGitOwner(state, explorerOpen)
  expect(file.gitWorktreeId).toBe('web-main')

  recordQuickOpenFileVisit(state, file)

  expect(readQuickOpenHistory(quickOpenHistoryScope(state, 'folder:f1', '/p'))).toEqual([
    'web/README.md'
  ])
})
