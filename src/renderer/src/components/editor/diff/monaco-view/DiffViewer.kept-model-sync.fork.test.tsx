// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DiffViewer from './DiffViewer'
import { DiffNavigationProvider } from '../review/diff-navigation-context'

const fixture = vi.hoisted(() => {
  // A kept Monaco model that @monaco-editor/react hands back still holding the previous text.
  const model = {
    value: 'stale on disk',
    getValue: () => model.value,
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: model.value.length + 1
    }),
    pushEditOperations: vi.fn((_before: null, edits: { text: string }[]) => {
      model.value = edits[0]?.text ?? model.value
      return null
    })
  }
  const modifiedEditor = {
    getModel: () => model,
    onDidDispose: () => ({ dispose: () => undefined })
  }
  const editor = {
    getOriginalEditor: () => ({}),
    getModifiedEditor: () => modifiedEditor,
    getModel: () => null,
    onDidDispose: () => ({ dispose: () => undefined }),
    onDidUpdateDiff: () => ({ dispose: () => undefined }),
    getLineChanges: () => [],
    goToDiff: () => undefined,
    saveViewState: () => null,
    focus: () => undefined
  }
  const state = {
    settings: { diffWordWrap: false },
    editorFontZoomLevel: 0,
    addDiffComment: vi.fn(),
    deleteDiffComment: vi.fn(),
    updateDiffComment: vi.fn(),
    scrollToDiffCommentId: null,
    setScrollToDiffCommentId: vi.fn()
  }
  return { model, editor, state }
})

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({ onMount }: { onMount: (editor: typeof fixture.editor) => void }) => {
    const mount = useRef(onMount)
    useEffect(() => {
      queueMicrotask(() => mount.current(fixture.editor))
    }, [])
    return <div />
  }
}))
vi.mock('@/store/index', () => ({
  useAppStore: <T,>(selector: (state: typeof fixture.state) => T) => selector(fixture.state)
}))
vi.mock('@/store/slices/diff-comments/diff-comment-owner', () => ({
  sourceParts: () => [],
  createDiffCommentViewSelector: () => () => ({ owner: null }),
  selectDiffCommentView: () => ({ owner: null, comments: undefined }),
  diffCommentOwnerKey: () => ''
}))
vi.mock('@/lib/editor/monaco/monaco-setup', () => ({
  monaco: { Uri: { parse: (path: string) => path }, editor: { getModel: () => null } }
}))
vi.mock('../../useContextualCopySetup', () => ({
  useContextualCopySetup: () => ({ setupCopy: vi.fn(), toastNode: null })
}))
vi.mock('../../../diff-comments/useDiffCommentDecorator', () => ({
  useDiffCommentDecorator: vi.fn()
}))
vi.mock('./useDiffViewerFirstChangeAutoScroll', () => ({
  useDiffViewerFirstChangeAutoScroll: vi.fn()
}))
vi.mock('@/hooks/use-document-dark-theme', () => ({ useDocumentDarkTheme: () => false }))
vi.mock('./diff-editor-line-number-options', () => ({
  applyDiffEditorLineNumberOptions: () => ({ dispose: vi.fn() })
}))
vi.mock('./diff-editor-word-wrap-options', () => ({
  buildDiffEditorWordWrapOptions: () => ({}),
  syncDiffEditorOriginalWordWrap: () => ({ dispose: vi.fn() })
}))
vi.mock('./diff-model-swap-view-state', () => ({
  preserveDiffViewStateAcrossModelSwaps: () => ({ dispose: vi.fn() })
}))
vi.mock('../../editor-shortcuts', () => ({
  installMonacoDiffChangeNavigationShortcut: () => vi.fn()
}))

async function mountViewer(syncKeptModifiedModelOnMount: boolean): Promise<void> {
  render(
    <DiffNavigationProvider>
      <DiffViewer
        modelKey="kept-model"
        originalContent="original"
        modifiedContent="fresh from disk"
        language="typescript"
        filePath="/work/a.ts"
        relativePath="a.ts"
        sideBySide
        syncKeptModifiedModelOnMount={syncKeptModifiedModelOnMount}
      />
    </DiffNavigationProvider>
  )
  await act(async () => {
    await Promise.resolve()
  })
}

afterEach(() => {
  cleanup()
  fixture.model.value = 'stale on disk'
  fixture.model.pushEditOperations.mockClear()
})

describe('DiffViewer kept modified model', () => {
  it('brings a reused modified model up to the current content when the editor mounts', async () => {
    await mountViewer(true)

    expect(fixture.model.value).toBe('fresh from disk')
    expect(fixture.model.pushEditOperations).toHaveBeenCalledOnce()
  })

  it('leaves the kept model alone when the caller does not ask for the sync', async () => {
    await mountViewer(false)

    expect(fixture.model.value).toBe('stale on disk')
    expect(fixture.model.pushEditOperations).not.toHaveBeenCalled()
  })
})
