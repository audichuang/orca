import { describe, expect, it } from 'vitest'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { OrcadMigrationCatalogPayload } from '../../shared/orcad-migration/orcad-migration-manifest'
import {
  rewriteOrcadMigrationPayloadPaths,
  type OrcadMigrationPathRewriter
} from './orcad-migration-path-rewrite'

const WSL_PREFIX = '\\\\wsl.localhost\\Ubuntu\\'
const UNC_REPO = `${WSL_PREFIX}home\\me\\app`
const TO_LINUX: OrcadMigrationPathRewriter = {
  path: (value) =>
    value.startsWith(WSL_PREFIX)
      ? `/${value.slice(WSL_PREFIX.length).replaceAll('\\', '/')}`
      : value
}

describe('orcad migration path fields: fork git owner', () => {
  it("rewrites a folder tab's gitWorktreeId along with its repo", () => {
    const payload: OrcadMigrationCatalogPayload = {
      repositories: [],
      projectGroups: [],
      folderWorkspaces: [],
      dormantState: {
        version: 1,
        worktreeMeta: [],
        worktreeLineage: [],
        workspaceLineage: [],
        sparsePresets: [],
        retiredWorktreeNames: [],
        retiredWorktreeNamespaces: [],
        workspaceSession: {
          ...getDefaultWorkspaceSession(),
          openFilesByWorktree: {
            'folder:f1': [
              {
                filePath: `${UNC_REPO}\\notes.md`,
                relativePath: 'notes.md',
                worktreeId: 'folder:f1',
                gitWorktreeId: `app::${UNC_REPO}`,
                language: 'markdown'
              }
            ]
          }
        }
      }
    }
    const rewritten = rewriteOrcadMigrationPayloadPaths(payload, TO_LINUX)
    expect(rewritten.dormantState?.workspaceSession?.openFilesByWorktree?.['folder:f1']).toEqual([
      expect.objectContaining({
        filePath: '/home/me/app/notes.md',
        gitWorktreeId: 'app::/home/me/app'
      })
    ])
  })
})
