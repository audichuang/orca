// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import type { DiffViewerProps } from './diff/monaco-view/diff-viewer-props'
import { ChangesModeView } from './ChangesModeView'

const seen: Partial<DiffViewerProps>[] = []
vi.mock('./diff/monaco-view/DiffViewer', () => ({
  default: (props: Partial<DiffViewerProps>) => {
    seen.push(props)
    return <div data-testid="diff-viewer" />
  }
}))

afterEach(() => {
  cleanup()
  seen.length = 0
})

const activeFile: OpenFile = {
  id: 'file-1',
  filePath: '/repo/src/index.ts',
  relativePath: 'src/index.ts',
  worktreeId: 'wt-1',
  language: 'typescript',
  isDirty: true,
  mode: 'edit'
}

// Changes shares its buffer with Source/Rich; a remount must refresh the kept modified model from it.
it('asks the diff viewer to resync its kept modified model on mount', async () => {
  render(
    <ChangesModeView
      activeFile={activeFile}
      dc={{
        kind: 'text',
        originalContent: 'a\n',
        modifiedContent: 'a\n',
        originalIsBinary: false,
        modifiedIsBinary: false
      }}
      modifiedContent="b\n"
      activeConflictEntry={null}
      resolvedLanguage="typescript"
      sideBySide={false}
      viewStateScopeId="scope-1"
      diffViewStateKey="diff-1"
      onContentChange={() => {}}
      onSave={async () => true}
    />
  )
  await screen.findByTestId('diff-viewer')
  expect(seen.at(-1)?.syncKeptModifiedModelOnMount).toBe(true)
})
