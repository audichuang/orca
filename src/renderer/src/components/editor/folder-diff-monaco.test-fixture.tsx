import { vi } from 'vitest'
import { useAppStore } from '@/store'
import { createFakeDiffCommentEditor } from '../diff-comments/diff-comment-editor-test-fixture'
import { REPO, seedFolderGitOwner } from './folder-git-owner.test-fixture'

export const mountedDiffEditors: ReturnType<typeof createFolderDiffEditor>[] = []

export function createFolderDiffEditor() {
  const fake = createFakeDiffCommentEditor()
  const disposable = () => ({ dispose: () => {} })
  let value = 'retained model'
  const getValue = () => value
  const model = {
    getValue,
    isDisposed: () => false,
    getLanguageId: () => 'typescript',
    getLineCount: () => 10,
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 10,
      endColumn: 1
    }),
    pushEditOperations: (_cursor: unknown, edits: { text: string }[]) => {
      value = edits[0]!.text
    }
  }
  const code = Object.assign(fake.editor, {
    getModel: () => model,
    getValue,
    getContentHeight: () => 200,
    getRawOptions: () => ({ lineNumbers: 'on', wordWrap: 'off', wordWrapOverride2: 'off' }),
    updateOptions: () => {},
    onDidChangeConfiguration: disposable,
    onWillChangeModel: disposable,
    onDidChangeModel: disposable,
    onDidChangeCursorSelection: disposable,
    onDidFocusEditorText: disposable,
    onDidBlurEditorText: disposable,
    onDidChangeModelContent: disposable,
    onDidContentSizeChange: disposable,
    hasTextFocus: () => false,
    addContentWidget: () => {},
    removeContentWidget: () => {},
    layoutContentWidget: () => {},
    getPosition: () => ({ lineNumber: 1, column: 1 })
  })
  const diff = {
    getOriginalEditor: () => code,
    getModifiedEditor: () => code,
    getModel: () => ({ original: model, modified: model }),
    getContainerDomNode: () => fake.domNode,
    getLineChanges: () => [],
    onDidDispose: disposable,
    onDidUpdateDiff: disposable,
    saveViewState: () => null,
    focus: () => {},
    dispose: () => {}
  }
  return { fake, diff, getValue }
}

vi.mock('@monaco-editor/react', async () => {
  const { useEffect, useRef } = await import('react')
  return {
    DiffEditor: ({
      onMount
    }: {
      onMount: (editor: ReturnType<typeof createFolderDiffEditor>['diff'], api: unknown) => void
    }) => {
      const mount = useRef(onMount)
      useEffect(() => {
        const instance = createFolderDiffEditor()
        mountedDiffEditors.push(instance)
        mount.current(instance.diff, {})
        return () => {
          instance.fake.emitDispose()
          instance.fake.domNode.remove()
        }
      }, [])
      return <div />
    }
  }
})
vi.mock('@/lib/monaco-setup', () => ({
  monaco: {
    Uri: { parse: (path: string) => path },
    editor: { getModel: () => null, getModels: () => [], getEditors: () => [] }
  }
}))

export function seedFolderDiffNote(): void {
  mountedDiffEditors.length = 0
  seedFolderGitOwner()
  useAppStore.setState((s) => ({
    worktreesByRepo: {
      'repo-a': s.worktreesByRepo['repo-a']!.map((row) => ({
        ...row,
        diffComments: [
          {
            id: 'repo-note',
            worktreeId: REPO,
            filePath: 'src/a.ts',
            lineNumber: 1,
            body: 'Review the repo change',
            side: 'modified' as const,
            createdAt: 1
          }
        ]
      }))
    }
  }))
}

export function renderedRepoNote(): string {
  return mountedDiffEditors
    .flatMap(({ fake }) => [...fake.zones.values()].map((zone) => zone.domNode.textContent))
    .join('\n')
}
