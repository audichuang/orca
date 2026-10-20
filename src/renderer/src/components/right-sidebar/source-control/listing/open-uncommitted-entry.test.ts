import { describe, expect, it, vi } from 'vitest'
import { createEditorStore } from '@/store/slices/editor-slice-test-harness'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import { openUncommittedEntry } from './open-uncommitted-entry'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: vi.fn()
}))

function markdownEntry(overrides: Partial<GitStatusEntry> = {}): GitStatusEntry {
  return {
    path: 'docs/new.md',
    status: 'untracked',
    area: 'untracked',
    ...overrides
  }
}

describe('openUncommittedEntry', () => {
  it.each(['source', 'changes'] as const)('preserves an explicit %s choice on reselect', (mode) => {
    const store = createEditorStore()
    const entry = markdownEntry()
    openUncommittedEntry(store.getState(), 'wt-1', '/repo', entry)
    const fileId = store.getState().openFiles[0].id
    if (mode === 'changes') {
      store.getState().setEditorViewMode(fileId, 'changes')
    } else {
      store.getState().setMarkdownViewMode(fileId, 'source')
    }

    openUncommittedEntry(store.getState(), 'wt-1', '/repo', entry)

    const state = store.getState()
    expect(state.openFiles).toHaveLength(1)
    expect(mode === 'changes' ? state.editorViewMode[fileId] : state.markdownViewMode[fileId]).toBe(
      mode
    )
  })
})

function fakeState() {
  return {
    trackConflictPath: vi.fn(),
    openConflictFile: vi.fn(),
    openFile: vi.fn(),
    openDiff: vi.fn()
  }
}

const folderOptions = { preview: true, gitWorktreeId: 'repo-wt' }

describe('openUncommittedEntry in a folder workspace', () => {
  it('opens the diff tab in the folder and keeps git on the repo', () => {
    const state = fakeState()
    const entry: GitStatusEntry = { path: 'src/a.ts', area: 'staged', status: 'modified' }

    openUncommittedEntry(state, 'repo-wt', '/f/repo', entry, folderOptions, 'folder-wt')

    expect(state.openDiff).toHaveBeenCalledWith(
      'folder-wt',
      '/f/repo/src/a.ts',
      'src/a.ts',
      'typescript',
      true,
      folderOptions
    )
  })

  it('tracks conflicts on the repo but opens the conflict tab in the folder', () => {
    const state = fakeState()
    const entry: GitStatusEntry = {
      path: 'src/a.ts',
      area: 'unstaged',
      status: 'modified',
      conflictKind: 'both_modified',
      conflictStatus: 'unresolved'
    }

    openUncommittedEntry(state, 'repo-wt', '/f/repo', entry, folderOptions, 'folder-wt')

    expect(state.trackConflictPath).toHaveBeenCalledWith('repo-wt', 'src/a.ts', 'both_modified')
    expect(state.openConflictFile).toHaveBeenCalledWith(
      'folder-wt',
      '/f/repo',
      entry,
      'typescript',
      folderOptions
    )
  })

  it('opens new markdown as a folder edit tab that reads git from the repo', () => {
    const state = fakeState()
    const entry: GitStatusEntry = { path: 'README.md', area: 'untracked', status: 'untracked' }

    openUncommittedEntry(state, 'repo-wt', '/f/repo', entry, folderOptions, 'folder-wt')

    expect(state.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'folder-wt', gitWorktreeId: 'repo-wt' }),
      folderOptions
    )
  })

  it('uses the repo worktree for tabs outside a folder workspace', () => {
    const state = fakeState()
    const entry: GitStatusEntry = { path: 'src/a.ts', area: 'unstaged', status: 'modified' }

    openUncommittedEntry(state, 'repo-wt', '/repo', entry)

    expect(state.openDiff.mock.calls[0][0]).toBe('repo-wt')
  })
})
