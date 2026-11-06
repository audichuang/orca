import { beforeEach, describe, expect, it } from 'vitest'
import { localDesktopSession } from '../../../../shared/workspace-layout/workspace-layout-profile.test-fixture'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session/workspace-session-state-types'
import { useAppStore } from '..'
import type { AppState } from '../types'

const REPO = 'repo-a::/repo-a'
const FOLDER = 'folder:pkg'

type SavedFile = NonNullable<WorkspaceSessionState['openFilesByWorktree']>[string][number]

function hydrate(file: Omit<SavedFile, 'worktreeId' | 'language'>) {
  const session = localDesktopSession()
  session.openFilesByWorktree = {
    [FOLDER]: [{ ...file, worktreeId: FOLDER, language: 'markdown' }]
  }
  useAppStore.getState().hydrateEditorSession(session)
  return useAppStore.getState().openFiles.find((f) => f.filePath === file.filePath)
}

// Why: sessions saved while folder edit tabs stored repo-relative paths must restore folder-relative ones.
describe('hydrating a folder edit tab saved with a repo-relative path', () => {
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

  it('re-anchors the path to the folder and keeps the live owner', () => {
    const file = hydrate({
      filePath: '/repo-a/pkg/a.md',
      relativePath: 'pkg/a.md',
      gitWorktreeId: REPO
    })
    expect(file).toMatchObject({ worktreeId: FOLDER, relativePath: 'a.md', gitWorktreeId: REPO })
  })

  it('keeps a stale owner and its path when no folder root holds the file', () => {
    const file = hydrate({
      filePath: '/elsewhere/x.md',
      relativePath: 'x.md',
      gitWorktreeId: 'gone::/elsewhere'
    })
    expect(file).toMatchObject({ relativePath: 'x.md', gitWorktreeId: 'gone::/elsewhere' })
  })
})
