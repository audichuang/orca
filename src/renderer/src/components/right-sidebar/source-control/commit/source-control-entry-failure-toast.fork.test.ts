// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceControlToastTestOptions } from './source-control-toast-test-options'

const { toastError, toastDismiss } = vi.hoisted(() => ({
  toastError: vi.fn<(title: string, options?: SourceControlToastTestOptions) => void>(),
  toastDismiss: vi.fn<(id: string) => void>()
}))
vi.mock('sonner', () => ({ toast: { error: toastError, dismiss: toastDismiss } }))

const { storeState } = vi.hoisted(() => ({ storeState: { activeWorktreeId: 'wt-1' } }))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => undefined, { getState: () => storeState })
}))

import { showSourceControlEntryFailureToast } from './source-control-entry-failure-toast'

type FailureToastInput = Parameters<typeof showSourceControlEntryFailureToast>[0]

function lastToast(): { title: string; options: SourceControlToastTestOptions } {
  const [title = '', options = {}] = toastError.mock.lastCall ?? []
  return { title, options }
}

function show(overrides: Partial<FailureToastInput> = {}): void {
  showSourceControlEntryFailureToast({
    operation: 'stage',
    filePath: 'src/app.ts',
    error: new Error('index.lock exists'),
    worktreeId: 'wt-1',
    worktreeName: 'feature-a',
    ...overrides
  })
}

function clickRetry(): { preventDefault: ReturnType<typeof vi.fn> } {
  const event = { preventDefault: vi.fn() }
  lastToast().options.action?.onClick(event)
  return event
}

describe('showSourceControlEntryFailureToast for folder repos and git reasons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.activeWorktreeId = 'wt-1'
  })

  it('treats a repo shown inside the active folder workspace as the active worktree', () => {
    storeState.activeWorktreeId = 'folder:f1'
    const onRetry = vi.fn()
    show({ worktreeId: 'repo-wt', foregroundWorkspaceId: 'folder:f1', onRetry })
    // Why: several repos in one folder share file names, so the repo is always named.
    expect(lastToast().title).toBe('Failed to stage “src/app.ts” in feature-a')
    clickRetry()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('surfaces the git reason instead of the command line', () => {
    show({
      error: new Error(
        "Error invoking remote method 'git:stage': Error: Command failed: git add -- :(literal)src/app.ts\nfatal: Unable to create '/r/.git/index.lock': File exists.\n\nAnother git process seems to be running"
      )
    })
    expect(lastToast().options.description).toBe(
      "fatal: Unable to create '/r/.git/index.lock': File exists."
    )
  })
})
