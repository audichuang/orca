import { describe, expect, it } from 'vitest'
import { projectSessionTabs } from './old-client-session-tabs-projection'
import { build, testContext, WS } from '../workspace-layout-command.test-fixture'

const GRAPH_FILE = { filePath: 'git-graph:wt-1', relativePath: 'Git Graph', language: 'plaintext' }

describe('old-client session tabs with a Git Graph tab', () => {
  it('publishes the file tab beside it but no row for the Git Graph tab', () => {
    const { model, results } = build(testContext(), [
      {
        type: 'openEditorTab',
        workspace: WS,
        fileId: '/repo/README.md',
        contentType: 'editor',
        file: { filePath: '/repo/README.md', relativePath: 'README.md', language: 'markdown' }
      },
      {
        type: 'openEditorTab',
        workspace: WS,
        fileId: 'git-graph:wt-1',
        contentType: 'git-graph',
        view: {
          view: { mode: 'git-graph', gitGraph: { repoWorktreeId: 'wt-1' } },
          file: GRAPH_FILE
        }
      }
    ])
    const [readme, graph] = results
    expect(model.workspaces[WS]!.tabs.map((tab) => tab.kind)).toEqual(['editor', 'git-graph'])
    expect(model.workspaces[WS]!.editorViews?.[graph!.tabId!]?.view.mode).toBe('git-graph')

    const projected = projectSessionTabs(
      WS,
      model.workspaces[WS]!,
      { groups: {}, panes: {}, editorDrafts: {} },
      { tabLabels: {}, terminalRows: {}, browserTabs: {} },
      false
    )

    const ids = projected.tabs.map((tab) => tab.id)
    expect(ids).toContain(readme!.tabId!)
    expect(ids).not.toContain(graph!.tabId!)
    expect(projected.tabs).toHaveLength(1)
  })
})
