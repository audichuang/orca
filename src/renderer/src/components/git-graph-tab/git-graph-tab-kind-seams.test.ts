// Seams where upstream editor-kind code calls into fork-editor-tab-kinds for the Git Graph tab.
import { describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import { getEditorHeaderCopyState } from '@/components/editor/editor-header'
import { isWorkspaceTabContentType } from '@/lib/workspace-tab-palette-content-type'
import { closeMobileSessionTabInStore } from '@/runtime/mobile-session-tab-close'
import { reconcileOpenFilesForStatus } from '@/store/slices/editor/git/git-status-reconciliation'

const WORKTREE_ID = 'repo-1::/repo'

function gitGraphFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: 'git-graph:wt-1',
    filePath: 'git-graph:wt-1',
    relativePath: 'Git Graph: repo',
    worktreeId: WORKTREE_ID,
    language: 'plaintext',
    isDirty: false,
    mode: 'git-graph',
    gitGraph: { repoWorktreeId: WORKTREE_ID },
    ...overrides
  }
}

describe('Git Graph tab kind in upstream editor-kind sites', () => {
  it('heads the tab with its label and copies no path', () => {
    expect(getEditorHeaderCopyState(gitGraphFile())).toEqual({
      copyText: null,
      copyToastLabel: 'Git Graph: repo',
      pathLabel: 'Git Graph: repo',
      pathTitle: 'Git Graph: repo'
    })
  })

  it('lists the tab in the workspace tab palette', () => {
    expect(isWorkspaceTabContentType('git-graph')).toBe(true)
  })

  it('closes the tab from a phone through its open file', () => {
    const closeFile = vi.fn()
    const closeUnifiedTab = vi.fn(() => null)
    const closed = closeMobileSessionTabInStore(
      {
        unifiedTabsByWorktree: {
          [WORKTREE_ID]: [
            {
              id: 'tab-1',
              entityId: 'git-graph:wt-1',
              groupId: 'group-1',
              worktreeId: WORKTREE_ID,
              contentType: 'git-graph',
              label: 'Git Graph',
              customLabel: null,
              color: null,
              sortOrder: 0,
              createdAt: 1
            }
          ]
        },
        openFiles: [],
        closeFile,
        closeUnifiedTab
      },
      WORKTREE_ID,
      'tab-1'
    )
    expect(closed).toBe(true)
    expect(closeFile).toHaveBeenCalledWith('git-graph:wt-1')
    expect(closeUnifiedTab).not.toHaveBeenCalled()
  })

  it('leaves the tab alone when git status reconciles conflicts', () => {
    const openFiles = [
      gitGraphFile({
        conflict: {
          kind: 'conflict-editable',
          conflictKind: 'both_modified',
          conflictStatus: 'unresolved',
          conflictStatusSource: 'git'
        }
      })
    ]
    expect(reconcileOpenFilesForStatus(openFiles, WORKTREE_ID, [], true)).toBe(openFiles)
  })
})
