// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import EditorPanel from './EditorPanel'
import { registerDiffFileSequence } from './diff-file-sequence'
import {
  BRANCH,
  COMMIT,
  FOLDER,
  REPO,
  folderFile,
  installFolderRuntime,
  seedFolderGitOwner
} from './folder-git-owner.test-fixture'

vi.mock('@monaco-editor/react', () => ({ DiffEditor: () => null }))
vi.mock('@/lib/monaco-setup', () => ({
  monaco: {
    Uri: { parse: (path: string) => path },
    editor: { getModel: () => null, getModels: () => [], getEditors: () => [] }
  }
}))
let runtime: ReturnType<typeof installFolderRuntime>
beforeEach(() => {
  seedFolderGitOwner()
  runtime = installFolderRuntime()
  const file = folderFile({ relativePath: 'src/a.ts' })
  useAppStore.setState({ openFiles: [file], activeFileId: file.id })
})
afterEach(() => {
  cleanup()
  runtime.restore()
})

it('disables opening a working file deleted in the folder tab repo', () => {
  useAppStore.setState({
    gitStatusByWorktree: { [REPO]: [{ path: 'src/a.ts', status: 'deleted', area: 'unstaged' }] }
  })
  const view = render(
    <TooltipProvider>
      <EditorPanel />
    </TooltipProvider>
  )
  expect(view.getByRole('button', { name: 'Open file' }).hasAttribute('disabled')).toBe(true)
})

it('disables opening a working file the branch deleted in the folder tab repo', () => {
  const file = folderFile({ relativePath: 'src/a.ts', diffSource: 'branch', branchCompare: BRANCH })
  useAppStore.setState({
    openFiles: [file],
    activeFileId: file.id,
    gitBranchChangesByWorktree: { [REPO]: [{ path: 'src/a.ts', status: 'deleted' }] }
  })
  const view = render(
    <TooltipProvider>
      <EditorPanel />
    </TooltipProvider>
  )
  expect(view.getByRole('button', { name: 'Open file' }).hasAttribute('disabled')).toBe(true)
})

it('shows where the active commit diff sits in the file list it was opened from', () => {
  const file = folderFile({ id: 'commit-b', diffSource: 'commit', commitCompare: COMMIT })
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

it('opens a restored folder diff with its repo owner before the repo catalog reloads', () => {
  useAppStore.setState({ repos: [], worktreesByRepo: {} })
  const view = render(
    <TooltipProvider>
      <EditorPanel />
    </TooltipProvider>
  )
  fireEvent.click(view.getByRole('button', { name: 'Open file' }))
  expect(useAppStore.getState().openFiles.find((file) => file.mode === 'edit')).toMatchObject({
    worktreeId: FOLDER,
    gitWorktreeId: REPO
  })
})

it('shows the repo file notes in the folder diff header and reacts to note removal', () => {
  useAppStore.setState((s) => ({
    worktreesByRepo: {
      'repo-a': s.worktreesByRepo['repo-a']!.map((row) => ({
        ...row,
        diffComments: [
          {
            id: 'note',
            worktreeId: REPO,
            filePath: 'src/a.ts',
            lineNumber: 1,
            body: 'Review repo change',
            side: 'modified' as const,
            createdAt: 1
          }
        ]
      }))
    }
  }))
  const view = render(
    <TooltipProvider>
      <EditorPanel />
    </TooltipProvider>
  )
  expect(view.getByRole('button', { name: /AI notes/ }).textContent).toContain('1')
  act(() =>
    useAppStore.setState((s) => ({
      worktreesByRepo: {
        'repo-a': s.worktreesByRepo['repo-a']!.map((row) => ({ ...row, diffComments: [] }))
      }
    }))
  )
  expect(view.queryByRole('button', { name: /AI notes/ })).toBeNull()
})
