import { useAppStore } from '@/store'
import { settingsForRuntimeOwner } from '@/runtime/runtime-rpc-client'
import {
  getRuntimeGitBranchDiff,
  getRuntimeGitCommitDiff,
  getRuntimeGitDiff
} from '@/runtime/runtime-git-client'
import type { OpenFile } from '@/store/slices/editor'
import type {
  GitBranchChangeEntry,
  GitDiffResult
} from '../../../../../../shared/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { getCombinedDiffSectionConnectionId } from './combined-diff-section-connection'
import { withDiffSectionLoadTimeout } from './combined-diff-section-load-timeout'
import { getOpenFileGitWorktreeId } from '@/store/slices/editor/git/open-file-git-owner'

export function fetchCombinedDiffSection({
  branchCompare,
  commitCompare,
  entry,
  file,
  isAllMode,
  isBranchMode,
  isCommitMode
}: {
  branchCompare: NonNullable<OpenFile['branchCompare']> | null
  commitCompare: NonNullable<OpenFile['commitCompare']> | null
  entry: GitStatusEntry | GitBranchChangeEntry
  file: OpenFile
  isAllMode: boolean
  isBranchMode: boolean
  isCommitMode: boolean
}): Promise<GitDiffResult> {
  const gitWorktreeId = getOpenFileGitWorktreeId(file)
  const connectionId = getCombinedDiffSectionConnectionId(gitWorktreeId, file.filePath, entry.path)
  const state = useAppStore.getState()
  const fileSettings = settingsForRuntimeOwner(state.settings, file.runtimeEnvironmentId)
  if ((isBranchMode || (isAllMode && !('area' in entry))) && branchCompare) {
    return withDiffSectionLoadTimeout(
      getRuntimeGitBranchDiff(
        {
          settings: fileSettings,
          worktreeId: gitWorktreeId,
          worktreePath: file.filePath,
          connectionId
        },
        {
          compare: {
            baseRef: branchCompare.baseRef,
            baseOid: branchCompare.baseOid!,
            headOid: branchCompare.headOid!,
            mergeBase: branchCompare.mergeBase!
          },
          filePath: entry.path,
          oldPath: entry.oldPath
        }
      )
    )
  }
  if (isCommitMode && commitCompare) {
    return withDiffSectionLoadTimeout(
      getRuntimeGitCommitDiff(
        {
          settings: fileSettings,
          worktreeId: gitWorktreeId,
          worktreePath: file.filePath,
          connectionId
        },
        {
          commitOid: commitCompare.commitOid,
          parentOid: commitCompare.parentOid,
          filePath: entry.path,
          oldPath: entry.oldPath
        }
      )
    )
  }
  return withDiffSectionLoadTimeout(
    getRuntimeGitDiff(
      {
        settings: fileSettings,
        worktreeId: gitWorktreeId,
        worktreePath: file.filePath,
        connectionId
      },
      {
        filePath: entry.path,
        staged: 'area' in entry && entry.area === 'staged'
      }
    )
  )
}
