// @vitest-environment happy-dom
// Fork: the Add to chat action quotes the folder-relative path the editor hands it, not the repo-relative one.
import type { editor } from 'monaco-editor'
import { expect, it, vi } from 'vitest'
import { installMonacoEditorInputBindings } from './monaco-editor-input-bindings'

const chatMenu = vi.hoisted(() => {
  const menu: { quote: string | null } = { quote: null }
  return menu
})

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/store', () => ({ useAppStore: { getState: vi.fn() } }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./editor-shortcuts', () => ({
  installEditorSaveShortcut: () => () => undefined,
  installMonacoEditorFindShortcut: () => () => undefined,
  installEditorAddReviewNoteShortcut: () => () => undefined
}))
vi.mock('../native-chat/add-to-chat-point-menu', () => ({
  openAddToChatMenuAt: (menu: { quote: string }) => {
    chatMenu.quote = menu.quote
  }
}))

it('quotes the selection under the folder-relative path', () => {
  const actions = new Map<string, () => void>()
  const container = document.createElement('div')
  document.body.append(container)
  const selection = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 11,
    isEmpty: () => false,
    getEndPosition: () => ({ lineNumber: 1, column: 11 })
  }
  const editorStub = {
    getModel: () => ({ getValueInRange: () => '# selected' }),
    getContainerDomNode: () => container,
    getSelections: () => [selection],
    getScrolledVisiblePosition: () => null,
    addAction: (action: { id: string; run: () => void }) => {
      actions.set(action.id, action.run)
      return { dispose: () => undefined }
    }
  }
  installMonacoEditorInputBindings({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Add to chat reads only the methods stubbed above.
    editorInstance: editorStub as unknown as editor.IStandaloneCodeEditor,
    worktreeId: 'folder:f',
    editorContainerRef: { current: container },
    propsRef: {
      current: {
        relativePath: 'README.md',
        chatRelativePath: 'repo-a/README.md',
        language: 'markdown',
        onSave: vi.fn(),
        onContentChange: vi.fn()
      }
    },
    readOnlyRef: { current: false },
    commentPopoverRef: { current: null },
    shouldShowMarkdownAnnotationsRef: { current: false },
    setCommentPopover: vi.fn(),
    setSelectionAnnotationTarget: vi.fn()
  })

  actions.get('orca.addSelectionToChat')?.()

  expect(chatMenu.quote).toContain('repo-a/README.md:1')
})
