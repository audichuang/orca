// Fork seam guard: a folder tab owned by a repo is matched to git status by its repo-relative path.
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { OpenFile } from '../types/open-file'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { toOpenConflictMetadata } from '../git/git-status-reconciliation'

const FOLDER = 'folder:f1'
const REPO = 'repo-1::/work/repo-1'
const CONFLICT: GitStatusEntry = {
  path: 'src/x.ts',
  status: 'modified',
  area: 'unstaged',
  conflictKind: 'both_modified',
  conflictStatus: 'unresolved',
  conflictStatusSource: 'git'
}

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

// Opened from the folder's Explorer: relativePath is the folder's, git status speaks the repo's.
const folderTab: OpenFile = {
  id: '/work/repo-1/src/x.ts',
  filePath: '/work/repo-1/src/x.ts',
  relativePath: 'repo-1/src/x.ts',
  worktreeId: FOLDER,
  gitWorktreeId: REPO,
  language: 'typescript',
  isDirty: false,
  mode: 'edit',
  conflict: toOpenConflictMetadata(CONFLICT)
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ worktreesByRepo: { 'repo-1': [repoWorktree] }, openFiles: [folderTab] })
})

describe("a folder tab's conflict under its repo's git status (fork)", () => {
  it('stays unresolved while the repo still reports the conflict', () => {
    useAppStore.getState().setGitStatus(REPO, { entries: [CONFLICT], conflictOperation: 'merge' })

    expect(useAppStore.getState().openFiles[0]?.conflict).toMatchObject({
      conflictStatus: 'unresolved'
    })
  })
})
