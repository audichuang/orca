import { describe, expect, it } from 'vitest'
import type { OpenFile } from '../types/open-file'
import { layoutEditorViewOfOpenFile, openFileOfLayoutEditorView } from './open-file-layout-view'

const FOLDER = 'folder:abc'
const REPO = 'repo-2::/work/inner'

// Fork field on an editor tab's view: the Git Graph tab's repo.
const FILES: [string, OpenFile][] = [
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
