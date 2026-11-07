// @vitest-environment happy-dom
// Fork: Monaco's Add to chat names a folder tab's file relative to the folder, not its nested repo.
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { MonacoEditorPropsRef } from './monaco-editor-mount-params'

const mounted = vi.hoisted(() => {
  const state: { propsRef: MonacoEditorPropsRef | null } = { propsRef: null }
  return state
})

vi.mock('@monaco-editor/react', () => ({ default: () => null, loader: { config: vi.fn() } }))
vi.mock('@/lib/monaco-setup', () => ({}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      settings: { theme: 'dark', terminalFontSize: 13, terminalFontFamily: 'monospace' },
      editorFontZoomLevel: 0,
      openFiles: [],
      worktreesByRepo: {},
      folderWorkspaces: [{ id: 'f', folderPath: '/workspace', executionHostId: 'local' }],
      setPendingEditorReveal: vi.fn(),
      setEditorCursorLine: vi.fn(),
      addDiffComment: vi.fn(),
      deleteDiffComment: vi.fn(),
      updateDiffComment: vi.fn(),
      scrollToDiffCommentId: null,
      setScrollToDiffCommentId: vi.fn(),
      worktreeDiffComments: {}
    })
}))
vi.mock('../diff-comments/useDiffCommentDecorator', () => ({ useDiffCommentDecorator: vi.fn() }))
vi.mock('./useContextualCopySetup', () => ({
  useContextualCopySetup: () => ({ setupCopy: vi.fn(), toastNode: null })
}))
vi.mock('./use-monaco-editor-mount', () => ({
  useMonacoEditorMount: (params: { propsRef: MonacoEditorPropsRef }) => {
    mounted.propsRef = params.propsRef
    return vi.fn()
  }
}))

import MonacoEditor from './MonacoEditor'

afterEach(cleanup)

it('hands the input bindings the folder-relative path for Add to chat', () => {
  render(
    <MonacoEditor
      fileId="readme"
      filePath="/workspace/repo-a/README.md"
      relativePath="README.md"
      worktreeId="folder:f"
      viewStateKey="readme"
      content="# selected"
      language="markdown"
      onContentChange={vi.fn()}
      onSave={vi.fn()}
    />
  )

  expect(mounted.propsRef?.current).toMatchObject({
    relativePath: 'README.md',
    chatRelativePath: 'repo-a/README.md'
  })
})
