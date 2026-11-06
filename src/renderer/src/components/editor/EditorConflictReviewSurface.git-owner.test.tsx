// @vitest-environment happy-dom
// Why: in a folder workspace the review tab belongs to the folder but its git reads belong to one repo.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoreApi } from 'zustand'
import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { GitStatusEntry } from '../../../../shared/git/status/git-status-types'
import { createEditorStore } from './autosave/editor-autosave-controller-test-fixture'
import { EditorConflictReviewSurface } from './EditorConflictReviewSurface'

type PanelProps = {
  onOpenEntry: (entry: GitStatusEntry) => void
  onRefreshSnapshot: () => void
  selectedContent: React.ReactNode
}

const storeRef = vi.hoisted((): { current: StoreApi<AppState> | null } => ({ current: null }))
const panel = vi.hoisted((): { current: PanelProps | null } => ({ current: null }))
const banner = vi.hoisted((): { current: GitStatusEntry | null } => ({ current: null }))
const retries = vi.hoisted((): { current: (() => void)[] } => ({ current: [] }))

vi.mock('@/store', () => {
  const getState = () => storeRef.current!.getState()
  return {
    useAppStore: Object.assign((select: (state: AppState) => unknown) => select(getState()), {
      getState
    })
  }
})
vi.mock('./editor-lazy-views', () => ({ ImageViewer: () => null, MonacoEditor: () => null }))
vi.mock('./EditorFileLoadErrorView', () => ({
  EditorFileLoadErrorView: ({ onRetry }: { onRetry: () => void }) => {
    retries.current.push(onRetry)
    return null
  }
}))
vi.mock('./ConflictComponents', () => ({
  ConflictBanner: ({ entry }: { entry: GitStatusEntry | null }) => {
    banner.current = entry
    return null
  },
  ConflictPlaceholderView: () => null,
  ConflictReviewPanel: (props: PanelProps) => {
    panel.current = props
    return props.selectedContent
  }
}))

const FOLDER = 'folder:f1'
const ENTRY: GitStatusEntry = {
  path: 'src/x.ts',
  status: 'modified',
  area: 'unstaged',
  conflictKind: 'both_modified',
  conflictStatus: 'unresolved',
  conflictStatusSource: 'git'
}

let root: Root | null = null

function renderReview(reloadContent: (file: OpenFile) => void): StoreApi<AppState> {
  const store = createEditorStore()
  storeRef.current = store
  store.setState({
    browserTabsByWorktree: {},
    tabsByWorktree: {},
    activeBrowserTabIdByWorktree: {},
    unifiedTabsByWorktree: {}
  })
  store
    .getState()
    .openConflictReview(
      FOLDER,
      '/f/a',
      [{ path: ENTRY.path, conflictKind: 'both_modified' }],
      'live-summary',
      { gitWorktreeId: 'repo-a' }
    )
  const review = store.getState().openFiles.find((file) => file.mode === 'conflict-review')!
  expect(review).toMatchObject({ worktreeId: FOLDER, gitWorktreeId: 'repo-a' })
  const openConflictReviewFile = vi.fn()
  const openConflictReview = vi.fn()
  store.setState({ openConflictReviewFile, openConflictReview })
  retries.current = []
  act(() => {
    root!.render(
      createElement(EditorConflictReviewSurface, {
        activeFile: review,
        viewStateScopeId: 'panel-1',
        fileContents: { '/f/a/src/x.ts': { content: '', isBinary: false, loadError: 'denied' } },
        editBuffers: {},
        openFiles: store.getState().openFiles,
        worktreeEntries: [ENTRY],
        pendingEditorReveal: null,
        getConflictNavigation: () => undefined,
        handleContentChangeForFile: () => {},
        handleSaveForFile: async () => true,
        reloadContent
      })
    )
  })
  return store
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
  root = createRoot(document.createElement('div'))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

describe('conflict review surface in a folder workspace', () => {
  it("opens a conflicted file under the review's repo", () => {
    const store = renderReview(() => {})
    panel.current!.onOpenEntry(ENTRY)
    expect(store.getState().openConflictReviewFile).toHaveBeenCalledWith(
      expect.any(String),
      FOLDER,
      '/f/a',
      ENTRY,
      'typescript',
      { gitWorktreeId: 'repo-a' }
    )
  })

  it("refreshes the snapshot under the review's repo", () => {
    const store = renderReview(() => {})
    panel.current!.onRefreshSnapshot()
    expect(store.getState().openConflictReview).toHaveBeenCalledWith(
      FOLDER,
      '/f/a',
      [{ path: ENTRY.path, conflictKind: 'both_modified' }],
      'live-summary',
      { gitWorktreeId: 'repo-a' }
    )
  })

  it("retries an overview read that no open tab holds under the review's repo", () => {
    const reloadContent = vi.fn()
    renderReview(reloadContent)
    expect(retries.current).toHaveLength(1)
    retries.current[0]()
    expect(reloadContent).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: FOLDER, gitWorktreeId: 'repo-a' }),
      expect.anything()
    )
  })

  it('matches a folder-relative selected tab to its repo-relative status entry', () => {
    const store = createEditorStore()
    storeRef.current = store
    store.setState({
      worktreesByRepo: {
        a: [
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: owner lookup reads only id, repoId and path.
          { id: 'repo-a', repoId: 'a', path: '/f/a' } as never
        ]
      }
    })
    banner.current = null
    const selected: OpenFile = {
      id: 'sel',
      filePath: '/f/a/src/x.ts',
      relativePath: 'a/src/x.ts',
      worktreeId: FOLDER,
      gitWorktreeId: 'repo-a',
      language: 'typescript',
      isDirty: false,
      mode: 'edit',
      conflict: {
        kind: 'conflict-editable',
        conflictKind: 'both_modified',
        conflictStatus: 'unresolved',
        conflictStatusSource: 'git'
      }
    }
    const review: OpenFile = {
      id: 'review',
      filePath: '/f/a',
      relativePath: '/f/a',
      worktreeId: FOLDER,
      gitWorktreeId: 'repo-a',
      language: 'plaintext',
      isDirty: false,
      mode: 'conflict-review',
      conflictReview: {
        source: 'live-summary',
        snapshotTimestamp: 0,
        entries: [{ path: ENTRY.path, conflictKind: 'both_modified' }],
        selectedFileId: 'sel'
      }
    }
    act(() => {
      root!.render(
        createElement(EditorConflictReviewSurface, {
          activeFile: review,
          viewStateScopeId: 'panel-1',
          fileContents: { sel: { content: '', isBinary: false } },
          editBuffers: {},
          openFiles: [selected],
          worktreeEntries: [ENTRY],
          pendingEditorReveal: null,
          getConflictNavigation: () => undefined,
          handleContentChangeForFile: () => {},
          handleSaveForFile: async () => true,
          reloadContent: () => {}
        })
      )
    })
    expect(banner.current).toBe(ENTRY)
  })
})
