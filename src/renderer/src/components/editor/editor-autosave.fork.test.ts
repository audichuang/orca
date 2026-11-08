import { describe, expect, it } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { getOpenFilesForExternalFileChange } from './autosave/editor-autosave'
import { indexEditorExternalWatchBatchPaths } from './external-changes/editor-external-watch-path-index'

function makeOpenFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: '/repo/file.ts',
    filePath: '/repo/file.ts',
    relativePath: 'file.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

describe('getOpenFilesForExternalFileChange in a folder workspace', () => {
  it('matches a folder-owned diff tab by the repo worktree that backs its git state', () => {
    const folderDiff = makeOpenFile({
      id: 'folder-diff',
      worktreeId: 'folder:f1',
      gitWorktreeId: 'wt-1',
      mode: 'diff',
      diffSource: 'unstaged'
    })

    expect(
      getOpenFilesForExternalFileChange([folderDiff], {
        worktreeId: 'wt-1',
        worktreePath: '/repo',
        relativePath: 'file.ts'
      }).map((file) => file.id)
    ).toEqual(['folder-diff'])
  })

  it('does not match another repo diff that shares the folder editor and relative path', () => {
    const repoBDiff = makeOpenFile({
      id: 'repo-b-diff',
      worktreeId: 'folder:f1',
      gitWorktreeId: 'repo-b',
      mode: 'diff',
      diffSource: 'unstaged'
    })

    expect(
      getOpenFilesForExternalFileChange([repoBDiff], {
        worktreeId: 'folder:f1',
        worktreePath: '/repo-a',
        relativePath: 'file.ts'
      })
    ).toEqual([])
  })

  it('matches a folder-owned diff tab across Windows separator and drive spellings', () => {
    const folderDiff = makeOpenFile({
      id: 'folder-diff',
      filePath: 'c:\\Repo\\file.ts',
      worktreeId: 'folder:f1',
      gitWorktreeId: 'wt-1',
      mode: 'diff',
      diffSource: 'unstaged'
    })

    expect(
      getOpenFilesForExternalFileChange([folderDiff], {
        worktreeId: 'wt-1',
        worktreePath: 'C:/Repo',
        relativePath: 'file.ts'
      }).map((file) => file.id)
    ).toEqual(['folder-diff'])
  })

  it('matches a repo-scoped diff tab when the folder itself reports the change, like the batch index', () => {
    const folderDiff = makeOpenFile({
      id: 'folder-diff',
      filePath: '/folder/repo-a/file.ts',
      relativePath: 'file.ts',
      worktreeId: 'folder:f1',
      gitWorktreeId: 'repo-a',
      mode: 'diff',
      diffSource: 'unstaged'
    })
    const folderScope = { worktreeId: 'folder:f1', worktreePath: '/folder' }
    const index = indexEditorExternalWatchBatchPaths(
      {
        worktreePath: '/folder',
        events: [{ kind: 'update', absolutePath: '/folder/repo-a/file.ts' }]
      },
      [folderDiff],
      { ...folderScope, runtimeEnvironmentId: null }
    )

    expect(index.matchingOpenFiles(index.changes[0]).map((file) => file.id)).toEqual([
      'folder-diff'
    ])
    expect(
      getOpenFilesForExternalFileChange([folderDiff], {
        ...folderScope,
        relativePath: 'repo-a/file.ts'
      }).map((file) => file.id)
    ).toEqual(['folder-diff'])
  })
})
