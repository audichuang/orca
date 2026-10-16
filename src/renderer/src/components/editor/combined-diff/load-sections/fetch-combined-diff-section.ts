import {
  getRuntimeGitBranchDiff,
  getRuntimeGitCommitDiff,
  getRuntimeGitDiff
} from '@/runtime/runtime-git-diff-client'
import type { OpenFile } from '@/store/slices/editor'
import type {
  GitBranchChangeEntry,
  GitDiffResult
} from '../../../../../../shared/git/diff/git-diff-compare-types'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import { acquireCombinedDiffSectionOperation } from './combined-diff-section-connection'
import { withDiffSectionLoadTimeout } from './combined-diff-section-load-timeout'
import { getOpenFileGitWorktreeId } from '@/store/slices/editor/git/open-file-git-owner'

export function fetchCombinedDiffSection({
  branchCompare,
  commitCompare,
  entry,
  file,
  isAllMode,
  isBranchMode,
  isCommitMode,
  operation = acquireCombinedDiffSectionOperation(file, entry.path)
}: {
  branchCompare: NonNullable<OpenFile['branchCompare']> | null
  commitCompare: NonNullable<OpenFile['commitCompare']> | null
  entry: GitStatusEntry | GitBranchChangeEntry
  file: OpenFile
  isAllMode: boolean
  isBranchMode: boolean
  isCommitMode: boolean
  operation?: ReturnType<typeof acquireCombinedDiffSectionOperation>
}): Promise<{
  result: GitDiffResult
  operation: ReturnType<typeof acquireCombinedDiffSectionOperation>
}> {
  const retainResult = async (result: Promise<GitDiffResult>) => {
    const value = await result
    operation.assertCurrent()
    return { result: value, operation }
  }
  // Fork-only: a folder tab's git reads go to its repo, not the folder workspace.
  const context = { ...operation.context, worktreeId: getOpenFileGitWorktreeId(file) }
  if ((isBranchMode || (isAllMode && !('area' in entry))) && branchCompare) {
    return retainResult(
      withDiffSectionLoadTimeout(
        getRuntimeGitBranchDiff(context, {
          compare: {
            baseRef: branchCompare.baseRef,
            baseOid: branchCompare.baseOid!,
            headOid: branchCompare.headOid!,
            mergeBase: branchCompare.mergeBase!
          },
          filePath: entry.path,
          oldPath: entry.oldPath
        })
      )
    )
  }
  if (isCommitMode && commitCompare) {
    return retainResult(
      withDiffSectionLoadTimeout(
        getRuntimeGitCommitDiff(context, {
          commitOid: commitCompare.commitOid,
          parentOid: commitCompare.parentOid,
          filePath: entry.path,
          oldPath: entry.oldPath
        })
      )
    )
  }
  return retainResult(
    withDiffSectionLoadTimeout(
      getRuntimeGitDiff(context, {
        filePath: entry.path,
        staged: 'area' in entry && entry.area === 'staged',
        ...('area' in entry && entry.area === 'staged' && entry.status === 'renamed'
          ? { oldPath: entry.oldPath }
          : {})
      })
    )
  )
}
