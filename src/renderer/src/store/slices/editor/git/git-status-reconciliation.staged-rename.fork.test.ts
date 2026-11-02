// Fork seam guard: a folder tab's staged rename is matched to repo status by its repo-relative path.
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { OpenFile } from '../types/open-file'
import type { Worktree } from '../../../../../../shared/worktree/types'

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'

const repoWorktree: Worktree = {
  id: REPO,
  repoId: 'repo-1',
  path: '/work/repo-1',
  head: 'abc',
  branch: 'refs/heads/main',
  isBare: false,
  isMainWorktree: true,
  displayName: 'main',
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  linkedGitLabMR: null,
  linkedGitLabIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
}

// Opened from the folder's Explorer: relativePath is folder-relative, git status is repo-relative.
const folderStagedDiffTab: OpenFile = {
  id: `${FOLDER}@${REPO}::diff::staged::/work/repo-1/src/new.ts`,
  filePath: '/work/repo-1/src/new.ts',
  relativePath: 'repo-1/src/new.ts',
  worktreeId: FOLDER,
  gitWorktreeId: REPO,
  language: 'typescript',
  isDirty: false,
  mode: 'diff',
  diffSource: 'staged'
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    worktreesByRepo: { 'repo-1': [repoWorktree] },
    openFiles: [folderStagedDiffTab]
  })
})

describe("a folder tab's staged rename under its repo's git status (fork)", () => {
  it('takes the repo-relative old path as branchOldPath', () => {
    useAppStore.getState().setGitStatus(REPO, {
      conflictOperation: 'unknown',
      entries: [{ path: 'src/new.ts', status: 'renamed', area: 'staged', oldPath: 'src/old.ts' }]
    })

    expect(useAppStore.getState().openFiles[0]).toMatchObject({
      relativePath: 'repo-1/src/new.ts',
      branchOldPath: 'src/old.ts'
    })
  })
})
