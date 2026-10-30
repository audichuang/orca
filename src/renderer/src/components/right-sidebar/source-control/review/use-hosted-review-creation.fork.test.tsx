// @vitest-environment happy-dom
// Fork seam guard: a folder repo section opens created/existing PR links in the folder workspace, not the repo worktree.
import { act, cleanup, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { localizedHostedReviewCopy } from '@/i18n/hosted-review-localized-copy'
import { getDefaultSettings } from '../../../../../../shared/constants'
import type { CreateHostedReviewResult } from '../../../../../../shared/hosted-review'
import {
  DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
  getDefaultSourceControlAiSettings
} from '../../../../../../shared/source-control-ai-settings'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'
import { useSourceControlHostedReviewCreation } from './use-hosted-review-creation'

const { openAppHttpLink, toastSuccess } = vi.hoisted(() => ({
  openAppHttpLink: vi.fn(),
  toastSuccess: vi.fn()
}))
vi.mock('@/lib/app-http-link-open', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openAppHttpLink
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

const FOLDER = 'folder-workspace-1'
const REPO_WORKTREE = 'repo-1::/folder/repo'

type Input = Parameters<typeof useSourceControlHostedReviewCreation>[0]

afterEach(() => {
  cleanup()
  openAppHttpLink.mockReset()
  toastSuccess.mockReset()
  useAppStore.setState({ activeWorktreeId: null })
})

function makeInput(createdReview: CreateHostedReviewResult): Input {
  return {
    activePullRequestGenerationKey: null,
    activeRepo: {
      id: 'repo-1',
      path: '/folder/repo',
      displayName: 'repo',
      badgeColor: '#000',
      addedAt: 0
    },
    activeWorktreeId: REPO_WORKTREE,
    branchName: 'feature',
    createHostedReview: vi.fn(async () => createdReview),
    createPrInFlightRef: { current: {} },
    createStackedHostedReview: vi.fn(),
    handleGeneratePullRequestFields: vi.fn(),
    handlePullRequestCreated: vi.fn(async () => {}),
    hostedReviewCreateCopy: localizedHostedReviewCopy('github'),
    hostedReviewCreateProvider: 'github',
    hostedReviewCreation: {
      provider: 'github',
      review: null,
      canCreate: true,
      blockedReason: null,
      nextAction: null,
      reviewLookupOutcome: 'not_found'
    },
    prAiGenerationEnabled: false,
    prBase: 'main',
    prBody: '',
    prDraft: false,
    prFieldRevisions: { base: 0, title: 0, body: 0, draft: 0 },
    pullRequestFieldsInitialized: true,
    prFieldsAreSeedPlaceholders: false,
    prGenerating: false,
    prTitle: 'Add feature',
    resolvedPrCreationDefaults: {
      ...DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
      openAfterCreate: true
    },
    setCreatePrInFlightByWorktree: vi.fn(),
    setCreatePrIntentNoticeForWorktree: vi.fn(),
    settings: {
      ...getDefaultSettings('/home/test'),
      sourceControlAi: getDefaultSourceControlAiSettings()
    },
    worktreePath: '/folder/repo'
  }
}

function folderScope({ children }: { children: ReactNode }): ReactNode {
  return createElement(
    SourceControlWorktreeScopeContext.Provider,
    { value: { gitWorktreeId: REPO_WORKTREE, editorWorktreeId: FOLDER } },
    children
  )
}

describe('useSourceControlHostedReviewCreation in a folder repo section', () => {
  it('opens the created PR in the foreground folder workspace', async () => {
    useAppStore.setState({ activeWorktreeId: FOLDER })
    const input = makeInput({ ok: true, number: 7, url: 'https://github.com/o/r/pull/7' })
    const { result } = renderHook(() => useSourceControlHostedReviewCreation(input), {
      wrapper: folderScope
    })

    await act(async () => result.current.handleCreatePullRequest())

    expect(openAppHttpLink).toHaveBeenCalledWith('https://github.com/o/r/pull/7', {
      worktreeId: FOLDER
    })
  })

  it('opens an already-open PR in the folder workspace', async () => {
    useAppStore.setState({ activeWorktreeId: FOLDER })
    const input = makeInput({
      ok: false,
      code: 'already_exists',
      error: 'exists',
      existingReview: { number: 3, url: 'https://github.com/o/r/pull/3' }
    })
    const { result } = renderHook(() => useSourceControlHostedReviewCreation(input), {
      wrapper: folderScope
    })

    await act(async () => result.current.handleCreatePullRequest())
    const options: unknown = toastSuccess.mock.calls[0]?.[1]
    if (
      typeof options !== 'object' ||
      options === null ||
      !('action' in options) ||
      typeof options.action !== 'object' ||
      options.action === null ||
      !('onClick' in options.action) ||
      typeof options.action.onClick !== 'function'
    ) {
      throw new Error('already-open toast has no action')
    }
    options.action.onClick()

    expect(openAppHttpLink).toHaveBeenCalledWith('https://github.com/o/r/pull/3', {
      worktreeId: FOLDER
    })
  })
})
