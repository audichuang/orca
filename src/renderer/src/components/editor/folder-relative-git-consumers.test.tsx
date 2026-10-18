// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RuntimeFileReadClient from '@/runtime/runtime-file-read-client'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import type { OpenFile } from '@/store/slices/editor'
import { resolveEditorTabGitStatus } from '../tab-bar/tab-bar-item-model'
import {
  buildEditorTabGitStatusMap,
  selectEditorTabGitOwnerRoots
} from '../tab-bar/editor-tab-git-status'
import { getOpenFilesForExternalFileChange } from './editor-autosave'
import type { DiffContent, FileContent } from './editor-panel-content-types'
import { useEditorPanelFileContentLoader } from './useEditorPanelFileContentLoader'
import { useEditorPanelDiffContentLoader } from './useEditorPanelDiffContentLoader'

const mocks = vi.hoisted(() => ({ readRuntimeFileContent: vi.fn() }))
vi.mock('@/runtime/runtime-file-read-client', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeFileReadClient>()),
  readRuntimeFileContent: mocks.readRuntimeFileContent
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// A folder workspace at /f holding repo-a at /f/a.
const FOLDER = 'folder:f1'
const REPO = 'repo-a::/f/a'
const FILE_PATH = '/f/a/src/x.ts'
const REPO_RELATIVE = 'src/x.ts'
// What relativePath holds once it is relative to the tab owner (the folder), as upstream's layout owner writes it.
const FOLDER_RELATIVE = 'a/src/x.ts'

function seed(): void {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a partial catalog with only the fields the owner route reads, as restored-editor-owner-save-lifecycle.test.ts uses.
    {
      activeWorktreeId: FOLDER,
      settings: { editorAutoSave: false },
      repos: [{ id: 'repo-a', path: '/f/a', kind: 'git', executionHostId: 'local' }],
      worktreesByRepo: {
        'repo-a': [{ id: REPO, repoId: 'repo-a', path: '/f/a', hostId: 'local', branch: '' }]
      },
      detectedWorktreesByRepo: {},
      runtimeEnvironments: [],
      runtimeEnvironmentCatalogHydrated: true,
      removedRuntimeEnvironmentIds: new Set(),
      sshConnectionStates: new Map(),
      sshStateByEnvironment: new Map(),
      folderWorkspaces: [
        {
          id: 'f1',
          projectGroupId: 'g1',
          folderPath: '/f',
          connectionId: null,
          executionHostId: 'local'
        }
      ],
      projectGroups: [{ id: 'g1', name: 'F', executionHostId: 'local' }],
      gitStatusHugeByWorktree: {}
    } as unknown as Partial<AppState>
  )
}

/** Opens the repo file as the folder's repo section does, then rewrites relativePath folder-relative. */
function openFolderRelativeTab(overrides: Partial<OpenFile> = {}): OpenFile {
  const id = useAppStore.getState().openFile(
    {
      filePath: FILE_PATH,
      relativePath: REPO_RELATIVE,
      worktreeId: FOLDER,
      gitWorktreeId: REPO,
      runtimeEnvironmentId: null,
      language: 'typescript',
      mode: 'edit'
    },
    { suppressActiveRuntimeFallback: true }
  )
  useAppStore.setState((s) => ({
    openFiles: s.openFiles.map((f) =>
      f.id === id ? { ...f, relativePath: FOLDER_RELATIVE, ...overrides } : f
    )
  }))
  return useAppStore.getState().openFiles.find((f) => f.id === id)!
}

describe('git consumers of a folder tab whose relativePath is folder-relative', () => {
  beforeEach(seed)

  it('reads the file through the repo selector with the repo-relative path', async () => {
    mocks.readRuntimeFileContent.mockReset()
    mocks.readRuntimeFileContent.mockResolvedValue({ content: 'x', isBinary: false })
    const file = openFolderRelativeTab()
    let load: ReturnType<typeof useEditorPanelFileContentLoader> | null = null
    let fileContents: Record<string, FileContent> = {}
    const container = document.createElement('div')
    const root: Root = createRoot(container)
    function Harness(): null {
      load = useEditorPanelFileContentLoader({
        fileLoadRetryAttemptsRef: { current: {} },
        fileReadGenerationCounterRef: { current: 0 },
        fileReadGenerationRef: { current: {} },
        openFilesRef: {
          get current() {
            return useAppStore.getState().openFiles
          }
        },
        outstandingFileReadsRef: { current: {} },
        setFileContents: (updater) => {
          fileContents = typeof updater === 'function' ? updater(fileContents) : updater
        }
      })
      return null
    }
    act(() => root.render(<Harness />))
    await act(async () => load!(FILE_PATH, file.id, FOLDER, file.relativePath))
    act(() => root.unmount())

    expect(mocks.readRuntimeFileContent).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: REPO, relativePath: REPO_RELATIVE })
    )
  })

  it('diffs against the repo root and the repo-relative path', async () => {
    const diff = vi.fn(async () => ({
      kind: 'text',
      originalContent: '',
      modifiedContent: 'x',
      originalIsBinary: false,
      modifiedIsBinary: false
    }))
    const prevApi = window.api
    Object.assign(window, { api: { ...prevApi, git: { ...prevApi?.git, diff } } })
    const file = openFolderRelativeTab({ mode: 'diff', diffSource: 'unstaged' })
    let load: ReturnType<typeof useEditorPanelDiffContentLoader> | null = null
    let diffContents: Record<string, DiffContent> = {}
    const container = document.createElement('div')
    const root: Root = createRoot(container)
    function Harness(): null {
      load = useEditorPanelDiffContentLoader({
        diffReadGenerationCounterRef: { current: 0 },
        diffReadGenerationRef: { current: {} },
        outstandingDiffReadsRef: { current: {} },
        setDiffContents: (updater) => {
          diffContents = typeof updater === 'function' ? updater(diffContents) : updater
        }
      })
      return null
    }
    act(() => root.render(<Harness />))
    await act(async () => load!(file))
    act(() => root.unmount())
    Object.assign(window, { api: prevApi })

    expect(diff).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/f/a', filePath: REPO_RELATIVE })
    )
  })

  it('keeps a live conflict when the repo status names it repo-relative', () => {
    const conflict = {
      kind: 'conflict-editable' as const,
      conflictKind: 'both_modified' as const,
      conflictStatus: 'unresolved' as const,
      conflictStatusSource: 'git' as const
    }
    openFolderRelativeTab({ conflict })
    useAppStore.getState().setGitStatus(REPO, {
      entries: [
        {
          path: REPO_RELATIVE,
          status: 'modified',
          area: 'unstaged',
          conflictKind: 'both_modified',
          conflictStatus: 'unresolved'
        }
      ],
      conflictOperation: 'merge'
    })
    expect(useAppStore.getState().openFiles[0]?.conflict).toMatchObject({
      conflictStatus: 'unresolved'
    })
  })

  it('matches the diff tab when git mutates the repo path', () => {
    const file = openFolderRelativeTab({ mode: 'diff', diffSource: 'unstaged' })
    expect(
      getOpenFilesForExternalFileChange(useAppStore.getState().openFiles, {
        worktreeId: REPO,
        worktreePath: '/f/a',
        relativePath: REPO_RELATIVE
      }).map((f) => f.id)
    ).toEqual([file.id])
  })

  it('decorates the tab from the repo status entry', () => {
    const file = openFolderRelativeTab()
    const map = buildEditorTabGitStatusMap(
      [],
      { [REPO]: [{ path: REPO_RELATIVE, status: 'modified', area: 'unstaged' }] },
      selectEditorTabGitOwnerRoots(useAppStore.getState(), FOLDER)
    )
    expect(resolveEditorTabGitStatus(file, map)).toBe('modified')
  })
})
