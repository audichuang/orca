// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import {
  FOLDER,
  REPO,
  ROOT,
  seedFolderGitOwner
} from '@/components/editor/folder-git-owner.test-fixture'

beforeEach(seedFolderGitOwner)

it('stores a folder-relative path for a Source Control open on a runtime-hosted folder', () => {
  const id = useAppStore.getState().openFile({
    filePath: `${ROOT}/src/a.md`,
    relativePath: 'src/a.md',
    worktreeId: FOLDER,
    gitWorktreeId: REPO,
    language: 'markdown',
    mode: 'edit'
  })
  expect(useAppStore.getState().openFiles.find((f) => f.id === id)?.relativePath).toBe(
    'repo-a/src/a.md'
  )
})

it('stores a folder-relative path for a conflict open on a runtime-hosted folder', () => {
  useAppStore.getState().openConflictFile(
    FOLDER,
    ROOT,
    {
      path: 'src/a.md',
      status: 'modified',
      area: 'unstaged',
      conflictKind: 'both_modified',
      conflictStatus: 'unresolved',
      conflictStatusSource: 'git'
    },
    'markdown',
    { gitWorktreeId: REPO }
  )
  expect(useAppStore.getState().openFiles.find((f) => f.mode === 'edit')?.relativePath).toBe(
    'repo-a/src/a.md'
  )
})
