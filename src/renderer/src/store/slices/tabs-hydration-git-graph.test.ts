import { describe, expect, it, vi } from 'vitest'
import { parseWorkspaceSession } from '../../../../shared/workspace-session-schema'
import { buildHydratedTabState } from './tabs-hydration'

vi.stubGlobal('crypto', { randomUUID: () => `uuid-${Math.random().toString(36).slice(2, 8)}` })

const tab = (id: string, entityId: string, contentType: string, sortOrder: number) => ({
  id,
  entityId,
  groupId: 'g1',
  worktreeId: 'w1',
  contentType,
  label: id,
  customLabel: null,
  color: null,
  sortOrder,
  createdAt: sortOrder
})

describe('Git Graph tab session restore', () => {
  it('accepts a saved git-graph row but drops it on restore, keeping the real editor tab', () => {
    const parsed = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: 'w1',
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      openFilesByWorktree: {
        w1: [{ filePath: '/a.ts', relativePath: 'a.ts', worktreeId: 'w1', language: 'typescript' }]
      },
      unifiedTabs: {
        w1: [tab('graph', 'w1::git-graph', 'git-graph', 0), tab('editor', '/a.ts', 'editor', 1)]
      },
      tabGroups: {
        w1: [{ id: 'g1', worktreeId: 'w1', activeTabId: 'graph', tabOrder: ['graph', 'editor'] }]
      },
      activeGroupIdByWorktree: { w1: 'g1' }
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }
    // The schema must keep the row, or this test would pass without the transient rule.
    expect(parsed.value.unifiedTabs?.w1?.map((row) => row.contentType)).toEqual([
      'git-graph',
      'editor'
    ])

    const result = buildHydratedTabState(parsed.value, new Set(['w1']))

    expect(result.unifiedTabsByWorktree.w1).toEqual([
      expect.objectContaining({ id: 'editor', contentType: 'editor' })
    ])
    expect(result.groupsByWorktree.w1?.[0]).toEqual(
      expect.objectContaining({ tabOrder: ['editor'] })
    )
  })
})
