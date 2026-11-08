// Fork-only. openCommitFileInSequence holds the commit-file open moved out of upstream
// useGitHistoryCommitActions.openCommitFile (cache lookup, compare fields, language, options).
import type { GitHistoryItem } from '../../../../../../shared/git/history/git-history-types'
import type {
  GitBranchChangeEntry,
  GitCommitCompareResult
} from '../../../../../../shared/git/diff/git-diff-compare-types'
import type { SourceControlRowOpenEvent } from '../listing/split-open'
import { toCommitCompareSnapshot } from '@/store/slices/editor/git/git-status-reconciliation'
import { registerDiffFileSequence } from '../../../editor/diff-file-sequence'
import { detectLanguage } from '@/lib/language-detect'
import type {
  CommitCompareLike,
  EditorOpenTargetOptions
} from '@/store/slices/editor/types/open-file'
import type { EditorFilesSlice } from '@/store/slices/editor/types/editor-files-slice'
import { useAppStore } from '@/store'
import {
  editorOpenOwner,
  qualifyEditorContentId
} from '@/store/slices/editor/git/editor-open-owner'

/**
 * One row of a commit file list. Across a multi-commit selection a path diffs
 * from before its oldest selected change (`base`) to after its newest (`head`).
 */
export type CommitFileTarget = {
  entry: GitBranchChangeEntry
  head: GitHistoryItem
  base: GitHistoryItem
}

/** Opens one commit file; `sequence` is the list as shown, so the diff can step to its neighbours. */
export type OpenCommitFileHandler = (
  item: GitHistoryItem,
  entry: GitBranchChangeEntry,
  event?: SourceControlRowOpenEvent,
  shown?: { sequence: readonly CommitFileTarget[] }
) => void

type CommitFileCompare = CommitCompareLike

type OpenCommitDiff = EditorFilesSlice['openCommitDiff']

export function commitFileTargets(
  item: GitHistoryItem,
  entries: readonly GitBranchChangeEntry[]
): CommitFileTarget[] {
  return entries.map((entry) => ({ entry, head: item, base: item }))
}

function resolveCompare(
  target: CommitFileTarget,
  summaryFor: (commitId: string) => GitCommitCompareResult['summary'] | undefined
): CommitFileCompare | null {
  const single = target.base === target.head
  const head = summaryFor(target.head.id)
  const base = single ? head : summaryFor(target.base.id)
  if (!head || !base) {
    return null
  }
  return {
    commitOid: head.commitOid,
    parentOid: base.parentOid,
    compareRef: head.compareRef,
    baseRef: base.baseRef,
    subject: single ? target.head.subject : undefined,
    message: single ? target.head.message : undefined
  }
}

/**
 * Opens the clicked commit file and remembers the list it came from, so the
 * diff's change arrows can step into the neighbouring files.
 */
export function openCommitFileInSequence({
  item,
  entry,
  sequence,
  worktreeId,
  worktreePath,
  summaryFor,
  openCommitDiff,
  ownerOptions,
  targetGroupId,
  preview
}: {
  item: GitHistoryItem
  entry: GitBranchChangeEntry
  sequence: readonly CommitFileTarget[] | undefined
  worktreeId: string
  worktreePath: string
  summaryFor: (commitId: string) => GitCommitCompareResult['summary'] | undefined
  openCommitDiff: OpenCommitDiff
  /** Upstream's placement and host options, passed through to every open. */
  ownerOptions: Pick<
    EditorOpenTargetOptions,
    'placementWorkspaceId' | 'executionHostId' | 'runtimeEnvironmentId'
  >
  targetGroupId: string | undefined
  preview: boolean
}): void {
  const clicked = sequence?.find((target) => target.entry.path === entry.path) ?? {
    entry,
    head: item,
    base: item
  }
  const clickedCompare = resolveCompare(clicked, summaryFor)
  if (!clickedCompare) {
    return
  }
  const open = (
    target: CommitFileTarget,
    compare: CommitFileCompare,
    options: { targetGroupId: string | undefined; preview: boolean }
  ): void =>
    openCommitDiff(
      worktreeId,
      worktreePath,
      target.entry,
      compare,
      detectLanguage(target.entry.path),
      { ...ownerOptions, ...options }
    )
  // Why mirror openCommitDiff's id: the diff's change arrows look the file list up by tab id.
  const owner = editorOpenOwner(useAppStore.getState(), worktreeId, ownerOptions)
  const tabIdOf = (target: CommitFileTarget, compare: CommitFileCompare): string =>
    qualifyEditorContentId(
      `${worktreeId}::diff::commit::${toCommitCompareSnapshot(compare).compareVersion}::${target.entry.path}`,
      owner.runtimeEnvironmentId,
      owner.operationProvenance?.generation.route.executionHostId ?? undefined
    )
  const steps = (sequence ?? []).flatMap((target) => {
    const compare = resolveCompare(target, summaryFor)
    if (!compare) {
      return []
    }
    return [
      {
        key: tabIdOf(target, compare),
        // Why preview: stepping replaces the current preview tab, like single-clicking the next row.
        open: (groupId: string | undefined) =>
          open(target, compare, { targetGroupId: groupId, preview: true })
      }
    ]
  })
  registerDiffFileSequence(steps, tabIdOf(clicked, clickedCompare))
  open(clicked, clickedCompare, { targetGroupId, preview })
}
