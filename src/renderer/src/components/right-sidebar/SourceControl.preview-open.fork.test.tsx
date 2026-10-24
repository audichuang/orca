// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import SourceControl from './SourceControl'
import { SourceControlWorktreeScopeContext } from './source-control/folder/worktree-scope'

const mocks = vi.hoisted(() => {
  const activeRepo = {
    id: 'repo-1',
    path: '/repo',
    displayName: 'Repo',
    badgeColor: '#000',
    addedAt: 0
  }
  const activeWorktree = {
    id: 'wt-1',
    repoId: 'repo-1',
    path: '/repo/wt',
    head: 'abcdef123',
    branch: 'refs/heads/feature/source-control-preview',
    isBare: false,
    isMainWorktree: false,
    displayName: 'feature/source-control-preview',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
  const calls = {
    openDiff: vi.fn(),
    openFile: vi.fn(),
    openConflictFile: vi.fn(),
    openBranchDiff: vi.fn(),
    createEmptySplitGroup: vi.fn(),
    discardRuntimeGitPath: vi.fn(),
    bulkStageRuntimeGitPaths: vi.fn(),
    refreshGitStatusForWorktree: vi.fn(),
    requestEditorSaveQuiesce: vi.fn(),
    notifyEditorExternalFileChange: vi.fn()
  }
  return {
    activeRepo,
    activeWorktree,
    calls,
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: resetState fills the store double before each render.
    state: {} as Record<string, unknown>
  }
})

vi.mock('@/store', () => {
  const useAppStore = Object.assign(
    (selector?: (state: Record<string, unknown>) => unknown) =>
      selector ? selector(mocks.state) : mocks.state,
    {
      getState: () => mocks.state
    }
  )
  return { useAppStore }
})

vi.mock('@/store/selectors', () => ({
  useActiveWorktree: () => mocks.activeWorktree,
  useRepoById: (repoId: string | null) =>
    repoId === mocks.activeRepo.id ? mocks.activeRepo : null,
  useWorktreeMap: () => new Map([[mocks.activeWorktree.id, mocks.activeWorktree]])
}))

vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => vi.fn().mockResolvedValue(true)
}))

vi.mock('@/runtime/runtime-git-working-tree-client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    discardRuntimeGitPath: mocks.calls.discardRuntimeGitPath,
    bulkStageRuntimeGitPaths: mocks.calls.bulkStageRuntimeGitPaths
  }
})

vi.mock('@/components/editor/editor-autosave', () => ({
  requestEditorSaveQuiesce: mocks.calls.requestEditorSaveQuiesce,
  notifyEditorExternalFileChange: mocks.calls.notifyEditorExternalFileChange
}))

vi.mock('./git-status-refresh', () => ({
  refreshGitStatusForWorktree: mocks.calls.refreshGitStatusForWorktree
}))

function gitEntry(overrides: Partial<GitStatusEntry>): GitStatusEntry {
  return {
    path: 'src/file.ts',
    area: 'unstaged',
    status: 'modified',
    added: 1,
    removed: 0,
    ...overrides
  }
}

function noopAsync(value: unknown = undefined): () => Promise<unknown> {
  return vi.fn().mockResolvedValue(value)
}

function resetState(overrides: Partial<Record<string, unknown>> = {}): void {
  vi.clearAllMocks()
  mocks.calls.createEmptySplitGroup.mockReturnValue('group-2')
  mocks.calls.discardRuntimeGitPath.mockResolvedValue(undefined)
  mocks.calls.bulkStageRuntimeGitPaths.mockResolvedValue(undefined)
  mocks.calls.refreshGitStatusForWorktree.mockResolvedValue(undefined)
  mocks.calls.requestEditorSaveQuiesce.mockResolvedValue(undefined)
  mocks.state = {
    activeWorktreeId: mocks.activeWorktree.id,
    activeGroupIdByWorktree: { [mocks.activeWorktree.id]: 'group-1' },
    groupsByWorktree: { [mocks.activeWorktree.id]: [{ id: 'group-1', activeTabId: null }] },
    repos: [mocks.activeRepo],
    worktreesByRepo: { [mocks.activeRepo.id]: [mocks.activeWorktree] },
    sshConnectionStates: new Map(),
    sshStateByEnvironment: new Map(),
    runtimeStatusByEnvironmentId: new Map(),
    rightSidebarOpen: false,
    rightSidebarTab: 'source-control',
    gitStatusByWorktree: { [mocks.activeWorktree.id]: [] },
    gitBranchChangesByWorktree: { [mocks.activeWorktree.id]: [] },
    gitBranchCompareSummaryByWorktree: { [mocks.activeWorktree.id]: null },
    gitBranchLineTotalByWorktree: {},
    gitConflictOperationByWorktree: {},
    remoteStatusesByWorktree: {},
    isRemoteOperationActive: false,
    inFlightRemoteOpKind: null,
    settings: null,
    hostedReviewCache: {},
    prCache: {},
    commitMessageGenerationRecords: {},
    pullRequestGenerationRecords: {},
    getDiffComments: vi.fn(() => []),
    updateSettings: noopAsync(),
    openSettingsTarget: vi.fn(),
    openSettingsPage: vi.fn(),
    fetchHostedReviewForBranch: noopAsync(),
    getHostedReviewCreationEligibility: noopAsync(null),
    createHostedReview: noopAsync({ ok: false, error: 'not available' }),
    updateWorktreeMeta: noopAsync(),
    fetchPRForBranch: noopAsync(),
    enqueueGitHubPRRefresh: vi.fn(),
    updateRepo: noopAsync(),
    setGitStatus: vi.fn(),
    updateWorktreeGitIdentity: vi.fn(),
    beginGitBranchCompareRequest: vi.fn(() => 'request-key'),
    setGitBranchCompareResult: vi.fn(),
    clearGitBranchCompare: vi.fn(),
    fetchUpstreamStatus: noopAsync(),
    setUpstreamStatus: vi.fn(),
    pushBranch: noopAsync(),
    pullBranch: noopAsync(),
    fastForwardBranch: noopAsync(),
    syncBranch: noopAsync(),
    rebaseFromBase: noopAsync(),
    fetchBranch: noopAsync(),
    revealInExplorer: vi.fn(),
    trackConflictPath: vi.fn(),
    openDiff: mocks.calls.openDiff,
    openFile: mocks.calls.openFile,
    setEditorViewMode: vi.fn(),
    setMarkdownViewMode: vi.fn(),
    setPendingEditorReveal: vi.fn(),
    openConflictFile: mocks.calls.openConflictFile,
    openConflictReview: vi.fn(),
    openBranchDiff: mocks.calls.openBranchDiff,
    createEmptySplitGroup: mocks.calls.createEmptySplitGroup,
    openAllDiffs: vi.fn(),
    openBranchAllDiffs: vi.fn(),
    openCommitAllDiffs: vi.fn(),
    deleteDiffComment: noopAsync(true),
    clearDiffComments: noopAsync(true),
    clearDiffCommentsForFile: noopAsync(true),
    setScrollToDiffCommentId: vi.fn(),
    setRightSidebarOpen: vi.fn(),
    setRightSidebarTab: vi.fn(),
    allocateCommitMessageGenerationRequestId: vi.fn(() => 'commit-generation-1'),
    setCommitMessageGenerationRecord: vi.fn(),
    updateCommitMessageGenerationRecord: vi.fn(),
    pruneCommitMessageGenerationRecords: vi.fn(),
    allocatePullRequestGenerationRequestId: vi.fn(() => 'pr-generation-1'),
    setPullRequestGenerationRecord: vi.fn(),
    updatePullRequestGenerationRecord: vi.fn(),
    prunePullRequestGenerationRecords: vi.fn(),
    ...overrides
  }
}

// A folder workspace's repo section: git from the repo worktree, tabs in the folder's editor.
const FOLDER_SCOPE = { gitWorktreeId: mocks.activeWorktree.id, editorWorktreeId: 'folder:fw-1' }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetState()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function clickUncommitted(path: string, init: MouseEventInit = {}): void {
  const row = container.querySelector<HTMLDivElement>(`[data-source-control-path="${path}"]`)
  expect(row).not.toBeNull()
  act(() => {
    row?.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }))
  })
}

describe('SourceControl preview row opens in a folder workspace repo section', () => {
  it('opens a folder workspace repo section diff in the folder editor, read from the repo', () => {
    const folderKey = FOLDER_SCOPE.editorWorktreeId
    resetState({
      activeWorktreeId: folderKey,
      getKnownWorktreeById: (id: string) =>
        id === mocks.activeWorktree.id ? mocks.activeWorktree : null,
      gitStatusByWorktree: {
        [mocks.activeWorktree.id]: [gitEntry({ path: 'src/file.ts' })]
      }
    })
    act(() => {
      root.render(
        <TooltipProvider>
          <SourceControlWorktreeScopeContext.Provider value={FOLDER_SCOPE}>
            <SourceControl />
          </SourceControlWorktreeScopeContext.Provider>
        </TooltipProvider>
      )
    })

    clickUncommitted('src/file.ts')

    expect(mocks.calls.openDiff).toHaveBeenCalledWith(
      folderKey,
      '/repo/wt/src/file.ts',
      'src/file.ts',
      'typescript',
      false,
      { targetGroupId: undefined, preview: true, gitWorktreeId: mocks.activeWorktree.id }
    )
  })
})
