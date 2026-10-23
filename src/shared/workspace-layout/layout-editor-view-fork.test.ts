import { describe, expect, it } from 'vitest'
import { EditorViewRecord } from '../rpc-contract/workspace-layout-editor-file-params'
import type { LayoutEditorView } from './layout-editor-view'
import { publishEditorView } from './workspace-layout-published'

const GIT_GRAPH_VIEW: LayoutEditorView = {
  view: { mode: 'git-graph', gitGraph: { repoWorktreeId: 'repo-2::/work/inner' } },
  file: {
    filePath: 'folder:abc::git-graph',
    relativePath: 'Git Graph',
    language: 'plaintext',
    runtimeEnvironmentId: null
  }
}

describe("main's editor view of a fork tab", () => {
  it("accepts a Git Graph tab's view from the window", () => {
    expect(EditorViewRecord.safeParse(GIT_GRAPH_VIEW).success).toBe(true)
  })

  it("keeps a folder tab's git owner through the window's record and main's publish", () => {
    const view: LayoutEditorView = {
      view: { mode: 'diff', diffSource: 'unstaged' },
      file: {
        filePath: '/work/inner/a.ts',
        relativePath: 'a.ts',
        language: 'typescript',
        gitWorktreeId: 'repo-2::/work/inner'
      }
    }
    const parsed = EditorViewRecord.parse(view)
    expect(parsed.file.gitWorktreeId).toBe('repo-2::/work/inner')
    expect(publishEditorView(view).file.gitWorktreeId).toBe('repo-2::/work/inner')
  })
})
