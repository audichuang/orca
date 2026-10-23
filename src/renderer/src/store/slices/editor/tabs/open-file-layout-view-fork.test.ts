import { describe, expect, it } from 'vitest'
import type { OpenFile } from '../types/open-file'
import { layoutEditorViewOfOpenFile, openFileOfLayoutEditorView } from './open-file-layout-view'

const FOLDER = 'folder:abc'
const REPO = 'repo-2::/work/inner'

// Fork fields on an editor tab's view: a folder tab's git owner and the Git Graph tab.
const FILES: [string, OpenFile][] = [
  [
    "a folder diff tab with its repo's git owner",
    {
      id: `${FOLDER}::diff::unstaged::inner/a.ts`,
      filePath: '/work/inner/a.ts',
      relativePath: 'a.ts',
      worktreeId: FOLDER,
      gitWorktreeId: REPO,
      language: 'typescript',
      isDirty: false,
      diffSource: 'unstaged',
      mode: 'diff'
    }
  ],
  [
    'a Git Graph tab',
    {
      id: `${FOLDER}::git-graph`,
      filePath: `${FOLDER}::git-graph`,
      relativePath: 'Git Graph',
      worktreeId: FOLDER,
      language: 'plaintext',
      isDirty: false,
      runtimeEnvironmentId: null,
      gitGraph: { repoWorktreeId: REPO },
      mode: 'git-graph'
    }
  ]
]

describe("a fork editor tab's open file and main's view of it", () => {
  it.each(FILES)('%s round-trips through its view', (_name, file) => {
    const view = layoutEditorViewOfOpenFile(file)

    expect(view?.view.mode).toBe(file.mode)
    expect(
      openFileOfLayoutEditorView(view!, { entityId: file.id, worktreeId: file.worktreeId })
    ).toEqual(file)
  })
})
