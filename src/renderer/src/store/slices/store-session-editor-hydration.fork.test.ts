import { beforeEach, describe, expect, it } from 'vitest'
import { localDesktopSession } from '../../../../shared/workspace-layout/workspace-layout-profile.test-fixture'
import { parseWorkspaceSession } from '../../../../shared/workspace-session/workspace-session-schema'
import { useAppStore } from '..'
import type { AppState } from '../types'

const REPO = 'repo-a::/repo-a'
const FOLDER = 'folder:pkg'

type SavedTab = {
  filePath: string
  relativePath: string
  gitWorktreeId?: string
  runtimeEnvironmentId?: string
}

// Tabs as the removed folder git-owner layer saved them: folder-owned, repo-relative, with gitWorktreeId.
function hydrateLegacy(files: SavedTab[], keepFolderValid = false) {
  const parsed = parseWorkspaceSession({
    ...localDesktopSession(),
    openFilesByWorktree: {
      [FOLDER]: files.map((file) => ({ ...file, worktreeId: FOLDER, language: 'markdown' }))
    }
  })
  if (!parsed.ok) {
    throw new Error('legacy session failed to parse')
  }
  useAppStore
    .getState()
    .hydrateEditorSession(
      parsed.value,
      keepFolderValid ? { additionalValidWorkspaceKeys: [FOLDER] } : undefined
    )
  return useAppStore.getState().openFiles
}

describe('hydrating a folder tab saved by the folder git-owner layer', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: hydration reads only the folder and repo catalogs.
      {
        repos: [{ id: 'repo-a', path: '/repo-a', displayName: 'a', badgeColor: '', addedAt: 0 }],
        worktreesByRepo: {
          'repo-a': [{ id: REPO, repoId: 'repo-a', path: '/repo-a', isMainWorktree: true }]
        },
        folderWorkspaces: [{ id: 'pkg', folderPath: '/repo-a/pkg', projectGroupId: 'g1' }]
      } as unknown as Partial<AppState>
    )
  })

  it('restores upstream folder tabs: folder-relative inside the root, absolute outside it', () => {
    const files = hydrateLegacy([
      { filePath: '/repo-a/pkg/a.md', relativePath: 'pkg/a.md', gitWorktreeId: REPO },
      { filePath: '/repo-a/b.md', relativePath: 'b.md', gitWorktreeId: REPO },
      // Upstream's own absolute-path tab (a terminal link) keeps its shape.
      { filePath: '/repo-a/pkg/c.md', relativePath: '/repo-a/pkg/c.md' }
    ])
    expect(files.map(({ worktreeId, relativePath }) => ({ worktreeId, relativePath }))).toEqual([
      { worktreeId: FOLDER, relativePath: 'a.md' },
      { worktreeId: FOLDER, relativePath: '/repo-a/b.md' },
      { worktreeId: FOLDER, relativePath: '/repo-a/pkg/c.md' }
    ])
  })

  describe('a runtime-host folder tab while the folder catalog is not loaded yet', () => {
    beforeEach(() => {
      useAppStore.setState({ folderWorkspaces: [] })
    })

    it('restores a legacy tab as an absolute path', () => {
      const files = hydrateLegacy(
        [
          {
            filePath: '/srv/repo-a/pkg/a.md',
            relativePath: 'pkg/a.md',
            gitWorktreeId: REPO,
            runtimeEnvironmentId: 'env-1'
          }
        ],
        true
      )
      expect(files.map(({ relativePath }) => relativePath)).toEqual(['/srv/repo-a/pkg/a.md'])
    })

    it('keeps an upstream folder-relative tab untouched', () => {
      const files = hydrateLegacy(
        [{ filePath: '/srv/repo-a/pkg/a.md', relativePath: 'a.md', runtimeEnvironmentId: 'env-1' }],
        true
      )
      expect(files.map(({ relativePath }) => relativePath)).toEqual(['a.md'])
    })
  })
})
