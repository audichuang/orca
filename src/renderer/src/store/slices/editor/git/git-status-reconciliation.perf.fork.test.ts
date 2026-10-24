import { describe, expect, it } from 'vitest'
import type { OpenFile } from '../types/open-file'
import { reconcileOpenFilesForStatus } from './git-status-reconciliation'

function openFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: 'file',
    filePath: '/repo/file.ts',
    relativePath: 'file.ts',
    worktreeId: 'wt',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

const conflict: NonNullable<OpenFile['conflict']> = {
  kind: 'conflict-editable',
  conflictKind: 'both_modified',
  conflictStatus: 'unresolved',
  conflictStatusSource: 'git'
}

describe('folder-scoped conflict tabs', () => {
  it('reconciles a tab owned by a folder workspace against its repo status', () => {
    const tab = openFile({ worktreeId: 'folder:f1', gitWorktreeId: 'repo-wt', conflict })
    expect(reconcileOpenFilesForStatus([tab], 'folder:f1', [], true)).toEqual([tab])
    const [cleared] = reconcileOpenFilesForStatus([tab], 'repo-wt', [], true)
    expect(cleared.conflict).toBeUndefined()
  })
})
