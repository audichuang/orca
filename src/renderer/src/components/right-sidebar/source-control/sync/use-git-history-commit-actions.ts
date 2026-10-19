import { useCallback, useEffect, useRef } from 'react'
import { requireGitOwnerTarget } from '../../worktree-git-owner-target'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { getRuntimeGitCommitCompare } from '@/runtime/runtime-git-diff-client'
import { getRuntimeGitRemoteCommitUrl } from '@/runtime/runtime-git-working-tree-client'
import { getConnectionId } from '@/lib/connection-context'
import { detectLanguage } from '@/lib/language-detect'
import { translate } from '@/i18n/i18n'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type {
  GitBranchChangeEntry,
  GitCommitCompareResult
} from '../../../../../../shared/git-diff-compare-types'
import {
  shouldOpenSourceControlRowAsPreview,
  type SourceControlRowOpenEvent
} from '../listing/split-open'
import type { GitHistoryCommitAction } from './git-history-commit-context-menu'
import { openWorkspaceBrowserTab } from '@/lib/workspace-browser-tab-open'
import { copyHistoryCommitsFullSource } from './git-history-commit-copy'
import { explainCommitWithDefaultAgent } from './git-history-commit-explain'
import type { GitHistoryCommitActionHandler } from './use-git-history-commit-selection'

const EMPTY_BRANCH_CHANGE_ENTRIES: GitBranchChangeEntry[] = []

type GitHistoryCommitActions = {
  loadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  openHistoryCommitDiff: (item: GitHistoryItem) => Promise<void>
  openCommitFile: (
    item: GitHistoryItem,
    entry: GitBranchChangeEntry,
    event?: SourceControlRowOpenEvent
  ) => void
  handleCommitAction: GitHistoryCommitActionHandler
  copyCommitFileFullSource: (item: GitHistoryItem, entry: GitBranchChangeEntry) => void
}

export function useGitHistoryCommitActions({
  activeWorktreeId,
  editorWorktreeId,
  worktreePath,
  activeRepoTarget,
  resolveSplitTargetGroupId
}: {
  activeWorktreeId: string | null | undefined
  /** Workspace that owns opened tabs and agent terminals; differs from the repo inside a folder workspace. */
  editorWorktreeId: string | null | undefined
  worktreePath: string | null
  activeRepoTarget: RuntimeClientTarget | null
  resolveSplitTargetGroupId: (event?: SourceControlRowOpenEvent) => string | undefined
}): GitHistoryCommitActions {
  const tabOwnerId = editorWorktreeId ?? activeWorktreeId ?? ''
  const gitOwnerId =
    activeWorktreeId && tabOwnerId !== activeWorktreeId ? activeWorktreeId : undefined
  const openCommitAllDiffs = useAppStore((s) => s.openCommitAllDiffs)
  const openCommitDiff = useAppStore((s) => s.openCommitDiff)

  // Share compare results across expansion and diff opening to avoid a second round-trip.
  const commitCompareCacheRef = useRef<Map<string, GitCommitCompareResult>>(new Map())

  // Bound cached commit comparisons to the current worktree.
  useEffect(() => {
    commitCompareCacheRef.current = new Map()
  }, [activeWorktreeId])

  const loadCommitFiles = useCallback(
    async (item: GitHistoryItem): Promise<GitBranchChangeEntry[]> => {
      if (!activeWorktreeId || !worktreePath) {
        return EMPTY_BRANCH_CHANGE_ENTRIES
      }
      const cached = commitCompareCacheRef.current.get(item.id)
      if (cached) {
        return cached.entries
      }
      const connectionId = getConnectionId(activeWorktreeId) ?? undefined
      const result = await getRuntimeGitCommitCompare(
        {
          // Compare on the repo owner, which may differ from the focused host.
          target: requireGitOwnerTarget(activeRepoTarget),
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        item.id
      )
      if (result.summary.status !== 'ready') {
        throw new Error(
          result.summary.errorMessage ??
            translate(
              'auto.components.right.sidebar.SourceControl.8a5ba6a988',
              'Failed to load commit diff'
            )
        )
      }
      commitCompareCacheRef.current.set(item.id, result)
      return result.entries
    },
    [activeRepoTarget, activeWorktreeId, worktreePath]
  )

  const openHistoryCommitDiff = useCallback(
    async (item: GitHistoryItem): Promise<void> => {
      if (!activeWorktreeId || !worktreePath) {
        return
      }
      try {
        await loadCommitFiles(item)
        const cached = commitCompareCacheRef.current.get(item.id)
        if (!cached) {
          return
        }
        openCommitAllDiffs(
          tabOwnerId,
          worktreePath,
          cached.summary,
          cached.entries,
          item.subject,
          item.message,
          gitOwnerId
        )
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.right.sidebar.SourceControl.8a5ba6a988',
                'Failed to load commit diff'
              )
        )
      }
    },
    [activeWorktreeId, gitOwnerId, loadCommitFiles, openCommitAllDiffs, tabOwnerId, worktreePath]
  )

  const openCommitFile = useCallback(
    (
      item: GitHistoryItem,
      entry: GitBranchChangeEntry,
      event?: SourceControlRowOpenEvent
    ): void => {
      if (!activeWorktreeId || !worktreePath) {
        return
      }
      const cached = commitCompareCacheRef.current.get(item.id)
      if (!cached) {
        return
      }
      const targetGroupId = resolveSplitTargetGroupId(event)
      openCommitDiff(
        tabOwnerId,
        worktreePath,
        entry,
        {
          commitOid: cached.summary.commitOid,
          parentOid: cached.summary.parentOid,
          compareRef: cached.summary.compareRef,
          baseRef: cached.summary.baseRef,
          subject: item.subject,
          message: item.message
        },
        detectLanguage(entry.path),
        {
          targetGroupId,
          preview: shouldOpenSourceControlRowAsPreview(event, targetGroupId),
          gitWorktreeId: gitOwnerId
        }
      )
    },
    [
      activeWorktreeId,
      gitOwnerId,
      openCommitDiff,
      resolveSplitTargetGroupId,
      tabOwnerId,
      worktreePath
    ]
  )

  const copyCommitText = useCallback(async (text: string, label: string): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(text)
      toast.success(
        translate('auto.components.right.sidebar.SourceControl.bf5082de46', '{{value0}} copied', {
          value0: label
        })
      )
    } catch {
      toast.error(
        translate(
          'auto.components.right.sidebar.SourceControl.c06193ef57',
          'Failed to copy {{value0}}',
          { value0: label.toLowerCase() }
        )
      )
    }
  }, [])

  const copyFullSource = useCallback(
    (items: readonly GitHistoryItem[], loadFiles: typeof loadCommitFiles): void => {
      if (!activeWorktreeId || !worktreePath) {
        return
      }
      void copyHistoryCommitsFullSource({
        items,
        worktreeId: activeWorktreeId,
        worktreePath,
        editorWorktreeId: editorWorktreeId ?? null,
        activeRepoTarget,
        loadCommitFiles: loadFiles
      })
    },
    [activeRepoTarget, activeWorktreeId, editorWorktreeId, worktreePath]
  )

  const handleCommitAction = useCallback(
    (action: GitHistoryCommitAction, item: GitHistoryItem, selectedItems): void => {
      if (action === 'copy-full-source') {
        copyFullSource(selectedItems ?? [item], loadCommitFiles)
        return
      }
      if (action === 'open-remote') {
        if (!activeWorktreeId || !worktreePath) {
          return
        }
        // Resolve the real origin in main; renderer origin identity is unreliable.
        void getRuntimeGitRemoteCommitUrl(
          {
            target: requireGitOwnerTarget(activeRepoTarget),
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId: getConnectionId(activeWorktreeId) ?? undefined
          },
          { sha: item.id }
        )
          .then((url) => {
            if (!url) {
              toast.error(
                translate(
                  'auto.components.right.sidebar.SourceControl.04a5d7239b',
                  'This repository has no supported web remote'
                )
              )
              return
            }
            return openWorkspaceBrowserTab({
              workspaceId: tabOwnerId,
              url,
              intent: { kind: 'url' }
            })
          })
          .catch(() => {
            toast.error(
              translate(
                'auto.components.right.sidebar.SourceControl.15b6e834ac',
                'Failed to open commit in browser'
              )
            )
          })
        return
      }
      if (action === 'copy-hash') {
        void copyCommitText(
          item.id,
          translate('auto.components.right.sidebar.SourceControl.d172a4f068', 'Commit hash')
        )
        return
      }
      if (action === 'copy-message') {
        void copyCommitText(
          item.message || item.subject,
          translate('auto.components.right.sidebar.SourceControl.e283b50179', 'Commit message')
        )
        return
      }
      if (action !== 'explain') {
        return
      }
      if (!activeWorktreeId) {
        return
      }
      void explainCommitWithDefaultAgent(activeWorktreeId, item, {
        tabOwnerId,
        initialCwd: gitOwnerId ? (worktreePath ?? undefined) : undefined
      })
    },
    [
      activeRepoTarget,
      activeWorktreeId,
      copyCommitText,
      copyFullSource,
      gitOwnerId,
      loadCommitFiles,
      tabOwnerId,
      worktreePath
    ]
  )

  // Why a one-entry loader: the commit's Copy Full Source, narrowed to the right-clicked file.
  const copyCommitFileFullSource = useCallback(
    (item: GitHistoryItem, entry: GitBranchChangeEntry): void =>
      copyFullSource([item], async () => [entry]),
    [copyFullSource]
  )

  return {
    loadCommitFiles,
    openHistoryCommitDiff,
    openCommitFile,
    handleCommitAction,
    copyCommitFileFullSource
  }
}
