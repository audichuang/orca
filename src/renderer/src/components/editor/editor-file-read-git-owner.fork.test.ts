import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { fileMatchesReadOwner } from './editor-file-read-git-owner'

const FOLDER = 'folder:f1'
const REPO = 'web::/p/web'

// A folder tab bound to the repo it sits in keeps its folder-relative relativePath.
const tab: OpenFile = {
  id: 'tab-1',
  filePath: '/p/web/src/a.ts',
  relativePath: 'web/src/a.ts',
  worktreeId: FOLDER,
  gitWorktreeId: REPO,
  language: 'typescript',
  isDirty: false,
  mode: 'edit'
}

beforeEach(() => {
  useAppStore.setState({
    worktreesByRepo: { web: [makeWorktree({ id: REPO, repoId: 'web', path: '/p/web' })] }
  })
})

it("answers a read requested through the repo's owner and repo-relative path", () => {
  expect(fileMatchesReadOwner(tab, REPO, 'src/a.ts')).toBe(true)
})

it('still answers the folder owner and its own path, and nothing else', () => {
  expect(fileMatchesReadOwner(tab, FOLDER, 'web/src/a.ts')).toBe(true)
  expect(fileMatchesReadOwner(tab, REPO, 'src/b.ts')).toBe(false)
  expect(fileMatchesReadOwner(tab, 'other::/p/other', 'src/a.ts')).toBe(false)
})
