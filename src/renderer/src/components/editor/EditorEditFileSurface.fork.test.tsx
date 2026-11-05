// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'
import type { useMarkdownDocuments } from './markdown/documents/useMarkdownDocuments'
import { EditorEditFileSurface } from './EditorEditFileSurface'

vi.mock('./ChangesModeView', () => ({ ChangesModeView: () => <div data-testid="changes-view" /> }))
vi.mock('./external-changes/CustomEditorExternalChangeBanner', () => ({
  CustomEditorExternalChangeBanner: () => <div data-testid="external-change-banner" />
}))

afterEach(cleanup)

const markdownDocuments: ReturnType<typeof useMarkdownDocuments> = {
  markdownDocuments: [],
  openMarkdownDocument: async () => {},
  onOpenDocLink: () => {},
  previewProps: { markdownDocuments: [], onOpenDocument: async () => {} },
  mdSave: async () => false
}

it('keeps the Changes view in a flex column under the external-change banner', () => {
  const activeFile: OpenFile = {
    id: 'file-1',
    filePath: '/repo/src/index.ts',
    relativePath: 'src/index.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    externalMutation: 'changed'
  }
  render(
    <EditorEditFileSurface
      activeFile={activeFile}
      viewStateScopeId="scope-1"
      editorViewStateKey="view-state-1"
      diffViewStateKey="diff-view-state-1"
      pdfViewStateKey="pdf-view-state-1"
      pdfPreferenceKey="pdf-pref-1"
      fileContent={{ content: 'const a = 1\n', isBinary: false }}
      diffContent={undefined}
      editBuffer={undefined}
      activeConflictEntry={null}
      monacoLanguage="typescript"
      isMarkdown={false}
      isMermaid={false}
      isCsv={false}
      isNotebook={false}
      mdViewMode="source"
      inlineMarkdownRenderState={null}
      isChangesMode
      sideBySide={false}
      showMarkdownTableOfContents={false}
      showMarkdownFrontmatter={false}
      onCloseMarkdownTableOfContents={() => {}}
      markdownAnnotationsEnabled={false}
      pendingEditorReveal={null}
      markdownDocuments={markdownDocuments}
      getConflictNavigation={() => undefined}
      getMarkdownSourceLineOffset={() => 0}
      handleContentChange={() => {}}
      handleDirtyStateHint={() => {}}
      handleSave={async () => false}
      reloadContent={() => {}}
    />
  )
  expect(screen.getByTestId('external-change-banner')).toBeTruthy()
  // ChangesModeView sizes itself with flex-1; a block parent collapses the diff to 0 height.
  const parent = screen.getByTestId('changes-view').parentElement
  expect(parent?.classList.contains('flex')).toBe(true)
  expect(parent?.classList.contains('flex-col')).toBe(true)
  expect(parent?.classList.contains('flex-1')).toBe(true)
})
