// @vitest-environment happy-dom

import { act, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'

vi.mock('../git-graph-tab/GitGraphTabView', () => ({
  default: ({ file }: { file: OpenFile }) => <div data-testid="git-graph-view">{file.id}</div>
}))

import { EditorContent } from './EditorContent'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('EditorContent with a Git Graph tab', () => {
  it('draws the Git Graph view for a git-graph tab', async () => {
    const activeFile: OpenFile = {
      id: 'git-graph:wt-1',
      filePath: 'git-graph:wt-1',
      relativePath: 'Git Graph',
      worktreeId: 'wt-1',
      language: 'plaintext',
      isDirty: false,
      mode: 'git-graph',
      gitGraph: { repoWorktreeId: 'wt-1' }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <Suspense fallback={null}>
          <EditorContent
            activeFile={activeFile}
            viewStateScopeId={activeFile.id}
            fileContents={{}}
            diffContents={{}}
            editBuffers={{}}
            openFiles={[activeFile]}
            worktreeEntries={[]}
            resolvedLanguage="plaintext"
            isMarkdown={false}
            isMermaid={false}
            isCsv={false}
            isNotebook={false}
            mdViewMode="rich"
            inlineMarkdownRenderState={null}
            isChangesMode={false}
            sideBySide={false}
            pendingEditorReveal={null}
            handleContentChange={vi.fn()}
            handleContentChangeForFile={vi.fn()}
            handleDirtyStateHint={vi.fn()}
            handleSave={vi.fn()}
            handleSaveForFile={vi.fn()}
            reloadContent={vi.fn()}
          />
        </Suspense>
      )
    })
    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="git-graph-view"]')?.textContent).toBe(
        'git-graph:wt-1'
      )
    })
    act(() => root.unmount())
  })
})
