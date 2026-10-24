// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RuntimeFileReadClient from '@/runtime/runtime-file-read-client'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import type { FileContent } from './editor-panel-content-types'
import {
  useEditorPanelFileContentLoader,
  type EditorPanelFileContentLoader
} from './useEditorPanelFileContentLoader'
import { layoutApplyTestTransport } from '@/runtime/layout-apply-test-transport.test-fixture'
import {
  drawTabsFromMain,
  type TabsDrawnFromMain
} from '@/store/slices/tabs-drawn-from-main.test-fixture'

const mocks = vi.hoisted(() => ({ readRuntimeFileContent: vi.fn() }))
vi.mock('@/runtime/runtime-file-read-client', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeFileReadClient>()),
  readRuntimeFileContent: mocks.readRuntimeFileContent
}))
vi.mock('../../../../shared/layout-owner-switch', () => ({ ORCA_LAYOUT_OWNER_IS_MAIN: true }))
// Main draws the tabs and answers each move (T1 transport, apply mode).
vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeRpcClientWithLayoutApply(await importOriginal())
)
vi.mock('@/runtime/runtime-layout-client', async (importOriginal) =>
  (
    await import('@/runtime/layout-apply-test-transport.test-fixture')
  ).runtimeLayoutClientWithTestFrames(await importOriginal())
)

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const REPO = 'repo-a::/repo-a'
const FOLDER = 'folder:pkg'

/** A local git workspace and a local folder workspace opened at folderPath. */
function seedNestedLocalWorkspaces(folderPath: string): void {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a partial catalog with only the fields the owner route reads, as restored-editor-owner-save-lifecycle.test.ts uses.
    {
      activeWorktreeId: REPO,
      settings: { editorAutoSave: false },
      repos: [{ id: 'repo-a', path: '/repo-a', kind: 'git', executionHostId: 'local' }],
      worktreesByRepo: {
        'repo-a': [{ id: REPO, repoId: 'repo-a', path: '/repo-a', hostId: 'local', branch: '' }]
      },
      detectedWorktreesByRepo: {},
      runtimeEnvironments: [],
      runtimeEnvironmentCatalogHydrated: true,
      removedRuntimeEnvironmentIds: new Set(),
      sshConnectionStates: new Map(),
      sshStateByEnvironment: new Map(),
      folderWorkspaces: [
        {
          id: 'pkg',
          projectGroupId: 'pkg-group',
          folderPath,
          connectionId: null,
          executionHostId: 'local'
        }
      ],
      projectGroups: [{ id: 'pkg-group', name: 'Pkg', executionHostId: 'local' }],
      gitStatusHugeByWorktree: {}
    } as unknown as Partial<AppState>
  )
}

/** A tab opened by absolute path (a terminal link) for a file inside its folder workspace. */
function openAbsoluteTabInFolder(filePath: string): string {
  return useAppStore.getState().openFile(
    {
      filePath,
      relativePath: filePath,
      worktreeId: FOLDER,
      runtimeEnvironmentId: null,
      language: 'markdown',
      mode: 'edit'
    },
    { suppressActiveRuntimeFallback: true }
  )
}

let main: TabsDrawnFromMain | null = null
let sentBefore = 0

/** Main takes the seeded layout; the tab the test opens is drawn from its frame. */
async function drawFromMain<T>(open: () => T): Promise<T> {
  main = await drawTabsFromMain(useAppStore)
  const opened = open()
  await main.settle()
  sentBefore = layoutApplyTestTransport.sent.length
  return opened
}

/** Commands sent after the tab was drawn. */
function layoutCommands(): unknown[] {
  return layoutApplyTestTransport.sent.slice(sentBefore)
}

describe('a restored folder tab outside any repo, layout-owner build', () => {
  let container: HTMLDivElement
  let root: Root
  let load: EditorPanelFileContentLoader | null
  let fileContents: Record<string, FileContent>

  beforeEach(() => {
    mocks.readRuntimeFileContent.mockReset()
    mocks.readRuntimeFileContent.mockResolvedValue({ content: '# a', isBinary: false })
    fileContents = {}
    load = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    function LoaderHarness(): null {
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
    act(() => root.render(<LoaderHarness />))
  })

  afterEach(() => {
    main?.close()
    main = null
    act(() => root.unmount())
    container.remove()
  })

  // A folder beside the repo has no git owner, so its absolute tab still takes upstream's re-own.
  it('tells main when a read from another workspace re-owns an unbound folder tab in place', async () => {
    const filePath = '/pkg/a.md'
    seedNestedLocalWorkspaces('/pkg')
    const id = await drawFromMain(() => openAbsoluteTabInFolder(filePath))
    expect(useAppStore.getState().openFiles[0]?.gitWorktreeId).toBeUndefined()

    await act(async () => load!(filePath, filePath, REPO, 'a.md'))
    await main!.settle()

    const [file] = useAppStore.getState().openFiles
    expect(file).toMatchObject({ worktreeId: FOLDER, relativePath: 'a.md' })
    expect(file!.id).not.toBe(id)
    expect(useAppStore.getState().unifiedTabsByWorktree[FOLDER]).toEqual([
      expect.objectContaining({ entityId: file!.id })
    ])
    expect(layoutCommands()).toEqual([
      {
        type: 'renameEditorFiles',
        workspace: FOLDER,
        renames: [
          {
            fileId: id,
            newFileId: file!.id,
            record: {
              fromFilePath: filePath,
              file: expect.objectContaining({ filePath, relativePath: 'a.md' })
            }
          }
        ]
      }
    ])
  })
})
