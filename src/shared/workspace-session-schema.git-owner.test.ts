import { describe, expect, it } from 'vitest'
import { parseWorkspaceSession } from './workspace-session-schema'

// Fork contract: a folder-workspace tab's git owner survives the persisted-session zod parse
// (zod strips unknown keys, so a schema rewrite that drops the field fails silently otherwise).
describe('parseWorkspaceSession keeps the folder tab git owner', () => {
  it('preserves gitWorktreeId on an open file', () => {
    const result = parseWorkspaceSession({
      activeRepoId: null,
      activeWorktreeId: 'folder:f1',
      activeTabId: null,
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      openFilesByWorktree: {
        'folder:f1': [
          {
            filePath: '/work/core/a.ts',
            relativePath: 'a.ts',
            worktreeId: 'folder:f1',
            language: 'typescript',
            gitWorktreeId: 'repo-core::/work/core'
          }
        ]
      }
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.openFilesByWorktree?.['folder:f1']?.[0]?.gitWorktreeId).toBe(
        'repo-core::/work/core'
      )
    }
  })
})
