// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import EditorPanel from './EditorPanel'
import { registerDiffFileSequence } from './diff-file-sequence'
import {
  COMMIT,
  installFolderRuntime,
  repoDiffFile,
  seedFolderWithRepo
} from './folder-repo-runtime.test-fixture'

vi.mock('@monaco-editor/react', () => ({ DiffEditor: () => null }))
vi.mock('@/lib/monaco-setup', () => ({
  monaco: {
    Uri: { parse: (path: string) => path },
    editor: { getModel: () => null, getModels: () => [], getEditors: () => [] }
  }
}))
let runtime: ReturnType<typeof installFolderRuntime>
beforeEach(() => {
  seedFolderWithRepo()
  runtime = installFolderRuntime()
})
afterEach(() => {
  cleanup()
  runtime.restore()
})

it('shows where the active commit diff sits in the file list it was opened from', () => {
  const file = repoDiffFile({ id: 'commit-b', diffSource: 'commit', commitCompare: COMMIT })
  registerDiffFileSequence(
    ['commit-a', 'commit-b', 'commit-c'].map((key) => ({ key, open: vi.fn() })),
    'commit-b'
  )
  useAppStore.setState({ openFiles: [file], activeFileId: file.id })
  const view = render(
    <TooltipProvider>
      <EditorPanel />
    </TooltipProvider>
  )
  expect(view.getByRole('status').textContent).toBe('2/3 files')
})
