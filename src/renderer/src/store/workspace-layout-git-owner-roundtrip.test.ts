import { describe, expect, it } from 'vitest'
import { loadWorkspaceLayoutWithoutReport } from '../../../shared/workspace-layout/workspace-layout-load'
import { nameBasedLoadContext } from '../../../shared/workspace-layout/workspace-layout-minted-ids'
import { localDesktopSession } from '../../../shared/workspace-layout/workspace-layout-profile.test-fixture'
import { publishWorkspaceLayout } from '../../../shared/workspace-layout/workspace-layout-published'
import { GIT_KEY } from '../../../shared/workspace-layout/workspace-layout-session.test-fixture'
import type { OpenFile } from './slices/editor/types/open-file'
import { restorableEditorFile } from './slices/editor/tabs/editor-tab-layout-owner'
import { buildLayoutFrameSlices } from './workspace-layout-frame-slices'
import { useAppStore } from '.'
import type { AppState } from './types'

// A repo inside the tab owner's folder that has no layout frame of its own.
const INNER_REPO = 'repo-2::/Users/dev/orca/inner'
const APP_TS = '/Users/dev/orca/src/app.ts'

/** Saved session → disk layout → published frame → the editor files a restarted window shows. */
function restoredOpenFiles(gitWorktreeId: string | undefined): OpenFile[] {
  const session = localDesktopSession()
  session.openFilesByWorktree = {
    [GIT_KEY]: (session.openFilesByWorktree?.[GIT_KEY] ?? []).map((file) =>
      file.filePath === APP_TS ? { ...file, gitWorktreeId } : file
    )
  }
  const { layout, facts, desktopView } = loadWorkspaceLayoutWithoutReport(
    'local',
    session,
    nameBasedLoadContext()
  )
  const frame = publishWorkspaceLayout(layout.workspaces[GIT_KEY]!, 'local')
  return buildLayoutFrameSlices({ layouts: { [GIT_KEY]: frame }, facts, view: desktopView })
    .openFiles
}

describe('a folder tab keeps its git owner across a restart', () => {
  it('restores gitWorktreeId through the layout frame even when that repo has no frame', () => {
    const file = restoredOpenFiles(INNER_REPO).find((f) => f.filePath === APP_TS)
    expect(file?.gitWorktreeId).toBe(INNER_REPO)
  })

  it('restores no git owner for a tab that never had one', () => {
    const file = restoredOpenFiles(undefined).find((f) => f.filePath === APP_TS)
    expect(file).toBeDefined()
    expect(file?.gitWorktreeId).toBeUndefined()
  })

  it('saves the git owner only when it differs from the tab owner', () => {
    const base: OpenFile = {
      id: APP_TS,
      filePath: APP_TS,
      relativePath: 'src/app.ts',
      worktreeId: 'folder:abc',
      language: 'typescript',
      isDirty: false,
      mode: 'edit'
    }
    expect(restorableEditorFile({ ...base, gitWorktreeId: INNER_REPO }).gitWorktreeId).toBe(
      INNER_REPO
    )
    expect(
      restorableEditorFile({ ...base, gitWorktreeId: 'folder:abc' }).gitWorktreeId
    ).toBeUndefined()
  })
})

describe('a folder tab whose git owner is gone by the next launch', () => {
  it('re-anchors the repo-relative path to the folder when the owner is dropped', () => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: hydration reads only the folder catalog and the (empty) repo catalog.
      {
        folderWorkspaces: [{ id: 'f1', folderPath: '/f', projectGroupId: 'g1' }]
      } as unknown as Partial<AppState>
    )
    const session = localDesktopSession()
    // The shape a session saved while repo /f/gone backed the tab: relativePath relative to that repo.
    session.openFilesByWorktree = {
      'folder:f1': [
        {
          filePath: '/f/gone/src/x.ts',
          relativePath: 'src/x.ts',
          worktreeId: 'folder:f1',
          language: 'typescript',
          gitWorktreeId: 'gone::/f/gone'
        }
      ]
    }
    useAppStore.getState().hydrateEditorSession(session)
    const file = useAppStore.getState().openFiles.find((f) => f.filePath === '/f/gone/src/x.ts')
    expect(file).toMatchObject({ worktreeId: 'folder:f1', relativePath: 'gone/src/x.ts' })
    expect(file?.gitWorktreeId).toBeUndefined()
  })

  it('re-anchors against the root holding the file when hosts share the folder id', () => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: hydration reads only the folder catalog and the (empty) repo catalog.
      {
        folderWorkspaces: [
          { id: 'f1', folderPath: '/local/folder', projectGroupId: 'g1', executionHostId: 'local' },
          {
            id: 'f1',
            folderPath: '/remote/folder',
            projectGroupId: 'g1',
            executionHostId: 'runtime:builder'
          }
        ]
      } as unknown as Partial<AppState>
    )
    const session = localDesktopSession()
    session.openFilesByWorktree = {
      'folder:f1': [
        {
          filePath: '/remote/folder/repo/src/x.ts',
          relativePath: 'src/x.ts',
          worktreeId: 'folder:f1',
          language: 'typescript',
          runtimeEnvironmentId: 'builder',
          gitWorktreeId: 'gone::/remote/folder/repo'
        }
      ]
    }
    useAppStore.getState().hydrateEditorSession(session)
    const file = useAppStore
      .getState()
      .openFiles.find((f) => f.filePath === '/remote/folder/repo/src/x.ts')
    expect(file).toMatchObject({ relativePath: 'repo/src/x.ts' })
  })
})
