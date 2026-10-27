import { describe, expect, it } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import { indexEditorExternalWatchBatchPaths } from './editor-external-watch-path-index'

describe('editor external watch path batch index in a folder workspace', () => {
  it('matches a folder-scoped diff tab by absolute path, not its repo-relative path', () => {
    const scope = { worktreeId: 'folder:f', worktreePath: '/f', runtimeEnvironmentId: null }
    const repoDiff: OpenFile = {
      id: 'repo-a-diff',
      worktreeId: scope.worktreeId,
      gitWorktreeId: 'repo-a',
      mode: 'diff',
      diffSource: 'unstaged',
      filePath: '/f/a/src/x.ts',
      relativePath: 'src/x.ts',
      isDirty: false,
      language: 'typescript'
    }
    const index = indexEditorExternalWatchBatchPaths(
      {
        worktreePath: scope.worktreePath,
        events: [
          { kind: 'update', absolutePath: '/f/a/src/x.ts' },
          { kind: 'update', absolutePath: '/f/src/x.ts' }
        ]
      },
      [repoDiff],
      scope
    )
    expect(index.matchingOpenFiles(index.changes[0])).toEqual([repoDiff])
    expect(index.matchingOpenFiles(index.changes[1])).toEqual([])
  })

  it('matches a folder-scoped diff tab across Windows separator and drive spellings', () => {
    const scope = { worktreeId: 'folder:f', worktreePath: 'C:/F', runtimeEnvironmentId: null }
    const repoDiff: OpenFile = {
      id: 'repo-a-diff',
      worktreeId: scope.worktreeId,
      gitWorktreeId: 'repo-a',
      mode: 'diff',
      diffSource: 'unstaged',
      filePath: 'c:\\F\\a\\src\\x.ts',
      relativePath: 'src/x.ts',
      isDirty: false,
      language: 'typescript'
    }
    const index = indexEditorExternalWatchBatchPaths(
      {
        worktreePath: scope.worktreePath,
        events: [{ kind: 'update', absolutePath: 'C:/F/a/src/x.ts' }]
      },
      [repoDiff],
      scope
    )
    expect(index.matchingOpenFiles(index.changes[0])).toEqual([repoDiff])
  })
})
