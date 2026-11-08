// @vitest-environment happy-dom
//
// Fork: Add to chat quotes a folder tab's file relative to the folder, even when its git owner is a nested repo.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { MarkdownPreviewSourceOpenFile } from '../render-tree/markdown-preview-types'

const chat = vi.hoisted(() => {
  const state: {
    readQuotable: ((root: HTMLElement) => unknown) | null
    quotedPath: string | null
  } = { readQuotable: null, quotedPath: null }
  return state
})
vi.mock('../../../native-chat/selection-quotes/SelectionAddToChatPopover', () => ({
  SelectionAddToChatPopover: (props: { readQuotable: (root: HTMLElement) => unknown }) => {
    chat.readQuotable = props.readQuotable
    return null
  }
}))
vi.mock('../review/markdown-preview-chat-selection', () => ({
  readMarkdownPreviewChatSelection: (
    _root: HTMLElement,
    _content: string,
    relativePath: string
  ) => {
    chat.quotedPath = relativePath
    return null
  }
}))

const openFiles: MarkdownPreviewSourceOpenFile[] = []
const activeFileIdByWorktree: Record<string, string | null> = {}

// Provide only store reads used by this HTTP-link path; file actions should remain idle.
const storeState = {
  openFile: vi.fn(),
  activateMarkdownLink: vi.fn(),
  openMarkdownPreview: vi.fn(),
  setMarkdownViewMode: vi.fn(),
  markdownFrontmatterVisible: {},
  setPendingEditorReveal: vi.fn(),
  addDiffComment: vi.fn(),
  deleteDiffComment: vi.fn(),
  updateDiffComment: vi.fn(),
  clearDeliveredDiffComments: vi.fn(),
  keybindings: {},
  worktreesByRepo: {},
  repos: [],
  folderWorkspaces: [
    { id: 'f', folderPath: '/workspace', executionHostId: 'local' as const },
    { id: 'docs', folderPath: '/workspace/repo-a/docs', executionHostId: 'local' as const }
  ],
  projectGroups: [],
  openFiles,
  activeFileIdByWorktree,
  settings: { openLinksInApp: true },
  editorFontZoomLevel: 0
}

vi.mock('@/store/index', () => {
  const useAppStore = Object.assign(
    (selector: (s: typeof storeState) => unknown) => selector(storeState),
    { getState: () => storeState }
  )
  return { useAppStore }
})
vi.mock('@/lib/file-owner-runtime-target', () => {
  const getRuntimeTargetForFileOwner = (
    _state: unknown,
    _worktreeId: string | null | undefined,
    owner: string | null | undefined
  ) => (owner ? { kind: 'environment' as const, environmentId: owner } : { kind: 'local' as const })
  return {
    FILE_OWNER_UNRESOLVED_MESSAGE: 'unresolved',
    getRuntimeTargetForFileOwner,
    requireRuntimeTargetForFileOwner: getRuntimeTargetForFileOwner,
    getRuntimeTargetForWorktreeOwner: (state: unknown, worktreeId: string | null | undefined) =>
      getRuntimeTargetForFileOwner(state, worktreeId, undefined)
  }
})
vi.mock('@/runtime/rpc/targets/use-worktree-runtime-target', () => ({
  useFileOwnerRuntimeTarget: (_worktreeId: unknown, runtimeEnvironmentId?: string | null) =>
    runtimeEnvironmentId
      ? { kind: 'environment', environmentId: runtimeEnvironmentId }
      : { kind: 'local' }
}))
vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('../../document-images/useLocalImageSrc', () => ({
  useLocalImageSrc: (src?: string) => src
}))
vi.mock('../../MermaidBlock', () => ({ default: () => null }))
vi.mock('../../CodeBlockCopyButton', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}))
vi.mock('../../../diff-comments/DiffCommentCard', () => ({ DiffCommentCard: () => null }))
vi.mock('../../review-note-delivery/NotesSendMenu', () => ({ NotesSendMenu: () => null }))
vi.mock('../../markdown/navigation/MarkdownTableOfContentsPanel', () => ({
  MarkdownTableOfContentsPanel: () => null
}))

import MarkdownPreview from './MarkdownPreview'

let container: HTMLDivElement
let root: Root

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function quotedPathFor(filePath: string, sourceWorktreeId: string, sourceRelativePath: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(
      <MarkdownPreview
        content="# selected"
        filePath={filePath}
        sourceWorktreeId={sourceWorktreeId}
        sourceRelativePath={sourceRelativePath}
        scrollCacheKey="chat-quote"
      />
    )
  })
  chat.readQuotable?.(container)
  return chat.quotedPath
}

it('quotes a nested repo file relative to the folder that receives the chat', () => {
  expect(quotedPathFor('/workspace/repo-a/README.md', 'folder:f', 'README.md')).toBe(
    'repo-a/README.md'
  )
})

it('quotes a parent repo file outside the folder by its absolute path', () => {
  expect(quotedPathFor('/workspace/repo-a/README.md', 'folder:docs', 'README.md')).toBe(
    '/workspace/repo-a/README.md'
  )
})
