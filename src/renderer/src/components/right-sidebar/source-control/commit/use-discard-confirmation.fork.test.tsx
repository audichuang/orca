// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { runtimeTargetForOwnerEnvironment } from '@/runtime/runtime-client-target'
import {
  cleanupFolderSourceControl,
  FolderScope,
  resetFolderSourceControl,
  WORKTREE,
  REPO
} from '../panel/folder-source-control-test-fixture'
import { useSourceControlEntryMutations } from './use-entry-mutations'
import { useSourceControlDiscardConfirmation } from './use-discard-confirmation'

beforeEach(() => {
  resetFolderSourceControl()
})
afterEach(cleanupFolderSourceControl)

it('names the folder repo when discard fails after navigating into that repo workspace', async () => {
  const api = resetFolderSourceControl()
  let failDiscard = (_error: Error): void => {}
  api.git.discard.mockImplementation(
    () =>
      new Promise<void>((_resolve, reject) => {
        failDiscard = reject
      })
  )
  const { result } = renderHook(
    () => {
      const args = {
        activeRepoTarget: runtimeTargetForOwnerEnvironment(null),
        activeWorktreeId: WORKTREE.id,
        worktreePath: REPO.path,
        refreshActiveGitStatusAfterMutation: async () => {}
      }
      const mutations = useSourceControlEntryMutations(args)
      return useSourceControlDiscardConfirmation({
        ...args,
        ...mutations,
        grouped: { staged: [], unstaged: [], untracked: [] },
        isExecutingBulk: false,
        setIsExecutingBulk: () => {},
        clearSelection: () => {}
      })
    },
    { wrapper: FolderScope }
  )
  act(() =>
    result.current.requestDiscardEntry({ path: 'a.ts', area: 'unstaged', status: 'modified' })
  )
  act(() => result.current.confirmPendingDiscard())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  await act(async () => {
    useAppStore.setState({ activeWorktreeId: WORKTREE.id })
    failDiscard(new Error('index.lock exists'))
  })
  const notification = toast.getToasts().find((item) => item.id === 'source-control-entry-mutation')
  expect(notification && 'title' in notification ? notification.title : undefined).toBe(
    'Failed to discard “a.ts” in repo-a'
  )
})
