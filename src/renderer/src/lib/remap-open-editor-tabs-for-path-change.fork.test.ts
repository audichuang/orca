// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { remapOpenEditorTabsForPathChange } from './remap-open-editor-tabs-for-path-change'
import {
  drawTabsFromMain,
  type TabsDrawnFromMain
} from '@/store/slices/tabs-drawn-from-main.test-fixture'
import { editorMoveOwnerFromContext, type EditorMoveOwner } from '@/lib/open-editor-move-owner'

// Switch on: main renames the tabs, and its frame rekeys the content (T1 transport, apply mode).
vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)
vi.mock('@/runtime/runtime-layout-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeLayoutClientWithTestFrames(await importOriginal())
)

let main: TabsDrawnFromMain

function localMoveOwner(worktreeId: string | undefined): EditorMoveOwner {
  return editorMoveOwnerFromContext({ target: { kind: 'local' } }, worktreeId)
}

describe('remapOpenEditorTabsForPathChange for a scoped tab git owner', () => {
  beforeEach(async () => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    main = await drawTabsFromMain(useAppStore)
  })

  afterEach(() => main.close())

  it('keeps the repo scope in a retargeted scoped diff tab id', () => {
    useAppStore
      .getState()
      .openDiff('folder:f1', '/f/a/docs/readme.md', 'docs/readme.md', 'markdown', false, {
        gitWorktreeId: 'repo-a'
      })

    remapOpenEditorTabsForPathChange({
      fromPath: '/f/a/docs',
      toPath: '/f/a/notes',
      worktreePath: '/f/a',
      worktreeId: 'repo-a',
      owner: localMoveOwner('repo-a')
    })

    const moved = useAppStore.getState().openFiles.find((f) => f.mode === 'diff')
    expect(moved?.filePath).toBe('/f/a/notes/readme.md')
    expect(moved?.id.startsWith('folder:f1@repo-a::diff::unstaged::')).toBe(true)
  })

  it('keeps a scoped diff tab relative to its repo when the folder explorer renames it', () => {
    useAppStore
      .getState()
      .openDiff('folder:f1', '/f/a/docs/x.ts', 'docs/x.ts', 'typescript', false, {
        gitWorktreeId: 'repo-a'
      })

    remapOpenEditorTabsForPathChange({
      fromPath: '/f/a/docs/x.ts',
      toPath: '/f/a/docs/y.ts',
      worktreePath: '/f',
      worktreeId: 'folder:f1',
      owner: localMoveOwner('folder:f1')
    })

    const moved = useAppStore.getState().openFiles.find((f) => f.mode === 'diff')
    expect(moved?.filePath).toBe('/f/a/docs/y.ts')
    expect(moved?.relativePath).toBe('docs/y.ts')
    expect(moved?.gitWorktreeId).toBe('repo-a')
  })

  it('re-homes a scoped edit tab moved out of its git owner to the folder', () => {
    useAppStore.getState().openFile(
      {
        filePath: '/f/a/docs/x.ts',
        relativePath: 'docs/x.ts',
        worktreeId: 'folder:f1',
        gitWorktreeId: 'repo-a',
        runtimeEnvironmentId: null,
        language: 'typescript',
        mode: 'edit'
      },
      { suppressActiveRuntimeFallback: true }
    )

    remapOpenEditorTabsForPathChange({
      fromPath: '/f/a/docs/x.ts',
      toPath: '/f/b/x.ts',
      worktreePath: '/f',
      worktreeId: 'folder:f1',
      owner: localMoveOwner('folder:f1')
    })

    const moved = useAppStore.getState().openFiles.find((f) => f.mode === 'edit')
    expect(moved?.filePath).toBe('/f/b/x.ts')
    expect(moved?.relativePath).toBe('b/x.ts')
    expect(moved?.gitWorktreeId).toBeUndefined()
  })

  it('leaves a scoped diff tab alone when its file moves out of the git owner', () => {
    useAppStore
      .getState()
      .openDiff('folder:f1', '/f/a/docs/x.ts', 'docs/x.ts', 'typescript', false, {
        gitWorktreeId: 'repo-a'
      })

    remapOpenEditorTabsForPathChange({
      fromPath: '/f/a/docs/x.ts',
      toPath: '/f/b/x.ts',
      worktreePath: '/f',
      worktreeId: 'folder:f1',
      owner: localMoveOwner('folder:f1')
    })

    const diff = useAppStore.getState().openFiles.find((f) => f.mode === 'diff')
    expect(diff?.relativePath).toBe('docs/x.ts')
    expect(diff?.gitWorktreeId).toBe('repo-a')
  })

  it('re-homes a markdown preview and its source together when moved outside their repo', () => {
    const state = useAppStore.getState()
    const sourceId = state.openFile(
      {
        filePath: '/work/folder/repo-a/notes.md',
        relativePath: 'notes.md',
        worktreeId: 'folder:folder',
        gitWorktreeId: 'repo-a',
        runtimeEnvironmentId: null,
        language: 'markdown',
        mode: 'edit'
      },
      { suppressActiveRuntimeFallback: true }
    )
    state.openMarkdownPreview(
      useAppStore.getState().openFiles.find((file) => file.id === sourceId)!
    )
    useAppStore.setState((s) => ({
      openFiles: s.openFiles.map((file) =>
        file.mode === 'markdown-preview' ? { ...file, gitWorktreeId: 'repo-a' } : file
      )
    }))
    remapOpenEditorTabsForPathChange({
      fromPath: '/work/folder/repo-a/notes.md',
      toPath: '/work/folder/notes.md',
      worktreePath: '/work/folder',
      worktreeId: 'folder:folder',
      owner: localMoveOwner('folder:folder')
    })
    expect(
      useAppStore.getState().openFiles.find((file) => file.mode === 'markdown-preview')
    ).toMatchObject({
      filePath: '/work/folder/notes.md',
      relativePath: 'notes.md',
      gitWorktreeId: undefined,
      markdownPreviewSourceFileId: '/work/folder/notes.md'
    })
  })
})
