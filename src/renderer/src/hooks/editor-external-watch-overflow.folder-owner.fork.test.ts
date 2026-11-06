import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({ scheduleReload: vi.fn(), compareDirty: vi.fn() }))

vi.mock('./editor-external-watch-disk-verification', () => ({
  scheduleDebouncedEditorExternalReload: harness.scheduleReload,
  scheduleEditorSelfMoveEchoVerification: harness.compareDirty
}))

import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getOpenFilesForExternalFileChange } from '@/components/editor/autosave/editor-autosave'
import { reconcileEditorTabsAfterOverflow } from './editor-external-watch-overflow'

type Fixture = {
  repoPath: string
  folderPath: string
  filePath: string
  relativePath: string
}

function seedFolderWithRepo({ repoPath, folderPath }: Fixture): void {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a partial catalog with only the fields the folder git-owner resolver reads.
    {
      repos: [{ id: 'repo', path: repoPath, displayName: 'repo', badgeColor: '', addedAt: 0 }],
      worktreesByRepo: {
        repo: [{ id: 'repo-wt', repoId: 'repo', path: repoPath, isMainWorktree: true }]
      },
      folderWorkspaces: [
        { id: 'f1', projectGroupId: 'g1', folderPath, connectionId: null, executionHostId: 'local' }
      ]
    } as unknown as Partial<AppState>
  )
}

// Why: a folder tab bound to a repo must still name its file through the folder's own root.
describe('overflow reload of a folder tab bound to a repo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each<[string, Fixture]>([
    [
      'folder inside a repo',
      {
        repoPath: '/repo-a',
        folderPath: '/repo-a/pkg',
        filePath: '/repo-a/pkg/a.md',
        relativePath: 'a.md'
      }
    ],
    [
      'folder holding a repo',
      {
        repoPath: '/p/web',
        folderPath: '/p',
        filePath: '/p/web/README.md',
        relativePath: 'web/README.md'
      }
    ]
  ])('reloads the Explorer-opened tab (%s)', (_, fixture) => {
    seedFolderWithRepo(fixture)
    useAppStore.getState().openFile(
      {
        filePath: fixture.filePath,
        relativePath: fixture.relativePath,
        worktreeId: 'folder:f1',
        runtimeEnvironmentId: null,
        language: 'markdown',
        mode: 'edit'
      },
      { suppressActiveRuntimeFallback: true }
    )
    const [file] = useAppStore.getState().openFiles

    reconcileEditorTabsAfterOverflow(
      { worktreeId: 'folder:f1', worktreePath: fixture.folderPath },
      false
    )

    expect(harness.scheduleReload).toHaveBeenCalledOnce()
    const [notification] = harness.scheduleReload.mock.calls[0]
    expect(
      getOpenFilesForExternalFileChange(useAppStore.getState().openFiles, notification)
    ).toEqual([file])
    expect(file).toMatchObject({ relativePath: fixture.relativePath, gitWorktreeId: 'repo-wt' })
  })
})
