import type { EditorGet, EditorSet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'
import { joinPath } from '@/lib/path'
import type { OpenFile } from '../types/open-file'
import { withDiffContentReloadRequest } from '../file-ids/editor-file-ids'
import { resolveDiffRuntimeEnvironmentId } from '../git/diff-runtime-owner'
import { getScopedTabIdOwner } from '../git/open-file-git-owner'
import { toBranchCompareSnapshot, toCommitCompareSnapshot } from '../git/git-status-reconciliation'
import { resolveEditorOpenTargetGroupId } from '../tabs/editor-open-target-group'
import { resolveEditorPreviewIntent } from '../tabs/editor-preview-tab-setting'
import {
  getReplaceablePreviewFileId,
  openWorkspaceEditorItem,
  removeEditorStateForReplacedPreview
} from '../tabs/workspace-editor-item'

/** Tab id of a commit diff; the cross-file diff navigation looks its file list up by it. */
export function commitDiffTabId(
  worktreeId: string,
  gitWorktreeId: string | undefined,
  compareVersion: string,
  relativePath: string
): string {
  return `${getScopedTabIdOwner(worktreeId, gitWorktreeId)}::diff::commit::${compareVersion}::${relativePath}`
}

export function createOpenHistoryDiff(
  set: EditorSet,
  get: EditorGet
): Pick<EditorSlice, 'openBranchDiff' | 'openCommitDiff'> {
  return {
    openBranchDiff: (worktreeId, worktreePath, entry, compare, language, options) => {
      const branchCompare = toBranchCompareSnapshot(compare)
      const gitWorktreeId =
        options?.gitWorktreeId !== worktreeId ? options?.gitWorktreeId : undefined
      const id = `${getScopedTabIdOwner(worktreeId, gitWorktreeId)}::diff::branch::${compare.baseRef}::${branchCompare.compareVersion}::${entry.path}`
      const isPreview = resolveEditorPreviewIntent(get(), options?.preview)
      let editorItemTargetGroupId = options?.targetGroupId
      set((s) => {
        const targetGroupId =
          resolveEditorOpenTargetGroupId(s, worktreeId, options?.targetGroupId) ?? undefined
        editorItemTargetGroupId = targetGroupId
        const runtimeEnvironmentId = resolveDiffRuntimeEnvironmentId(
          s,
          gitWorktreeId ?? worktreeId,
          options?.runtimeEnvironmentId
        )
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          const updatedPreview = isPreview ? existing.isPreview : false
          const reopenedDiff = withDiffContentReloadRequest({
            ...existing,
            mode: 'diff' as const,
            diffSource: 'branch' as const,
            branchCompare,
            branchOldPath: entry.oldPath,
            conflict: undefined,
            skippedConflicts: undefined,
            conflictReview: undefined,
            isPreview: updatedPreview,
            runtimeEnvironmentId
          })
          return {
            openFiles: s.openFiles.map((f) => (f.id === id ? reopenedDiff : f)),
            activeFileId: id,
            activeTabType: 'editor',
            activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
            activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
          }
        }
        const newFile: OpenFile = {
          id,
          filePath: joinPath(worktreePath, entry.path),
          relativePath: entry.path,
          worktreeId,
          gitWorktreeId,
          language,
          isDirty: false,
          mode: 'diff',
          diffSource: 'branch',
          branchCompare,
          branchOldPath: entry.oldPath,
          conflict: undefined,
          skippedConflicts: undefined,
          conflictReview: undefined,
          isPreview: isPreview || undefined,
          runtimeEnvironmentId
        }
        if (isPreview) {
          const replaceablePreviewId = getReplaceablePreviewFileId(s, worktreeId, targetGroupId)
          const replaceablePreviewIndex = s.openFiles.findIndex(
            (file) => file.id === replaceablePreviewId
          )
          if (replaceablePreviewIndex !== -1) {
            return {
              openFiles: s.openFiles.map((file, index) =>
                index === replaceablePreviewIndex ? newFile : file
              ),
              ...removeEditorStateForReplacedPreview(s, s.openFiles[replaceablePreviewIndex], id),
              activeFileId: id,
              activeTabType: 'editor',
              activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
              activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
            }
          }
        }
        return {
          openFiles: [...s.openFiles, newFile],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
        }
      })
      void openWorkspaceEditorItem(
        get(),
        id,
        worktreeId,
        entry.path,
        'diff',
        isPreview,
        editorItemTargetGroupId
      )
    },

    openCommitDiff: (worktreeId, worktreePath, entry, compare, language, options) => {
      const commitCompare = toCommitCompareSnapshot(compare)
      const gitWorktreeId =
        options?.gitWorktreeId !== worktreeId ? options?.gitWorktreeId : undefined
      const id = commitDiffTabId(
        worktreeId,
        gitWorktreeId,
        commitCompare.compareVersion,
        entry.path
      )
      const isPreview = resolveEditorPreviewIntent(get(), options?.preview)
      let editorItemTargetGroupId = options?.targetGroupId
      set((s) => {
        const targetGroupId =
          resolveEditorOpenTargetGroupId(s, worktreeId, options?.targetGroupId) ?? undefined
        editorItemTargetGroupId = targetGroupId
        const runtimeEnvironmentId = resolveDiffRuntimeEnvironmentId(
          s,
          gitWorktreeId ?? worktreeId,
          options?.runtimeEnvironmentId
        )
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          const updatedPreview = isPreview ? existing.isPreview : false
          const reopenedDiff = withDiffContentReloadRequest({
            ...existing,
            mode: 'diff' as const,
            diffSource: 'commit' as const,
            commitCompare,
            branchOldPath: entry.oldPath,
            conflict: undefined,
            skippedConflicts: undefined,
            conflictReview: undefined,
            isPreview: updatedPreview,
            runtimeEnvironmentId
          })
          return {
            openFiles: s.openFiles.map((f) => (f.id === id ? reopenedDiff : f)),
            activeFileId: id,
            activeTabType: 'editor',
            activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
            activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
          }
        }
        const newFile: OpenFile = {
          id,
          filePath: joinPath(worktreePath, entry.path),
          relativePath: entry.path,
          worktreeId,
          gitWorktreeId,
          language,
          isDirty: false,
          mode: 'diff',
          diffSource: 'commit',
          commitCompare,
          branchOldPath: entry.oldPath,
          conflict: undefined,
          skippedConflicts: undefined,
          conflictReview: undefined,
          isPreview: isPreview || undefined,
          runtimeEnvironmentId
        }
        if (isPreview) {
          const replaceablePreviewId = getReplaceablePreviewFileId(s, worktreeId, targetGroupId)
          const replaceablePreviewIndex = s.openFiles.findIndex(
            (file) => file.id === replaceablePreviewId
          )
          if (replaceablePreviewIndex !== -1) {
            return {
              openFiles: s.openFiles.map((file, index) =>
                index === replaceablePreviewIndex ? newFile : file
              ),
              ...removeEditorStateForReplacedPreview(s, s.openFiles[replaceablePreviewIndex], id),
              activeFileId: id,
              activeTabType: 'editor',
              activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
              activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
            }
          }
        }
        return {
          openFiles: [...s.openFiles, newFile],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
        }
      })
      void openWorkspaceEditorItem(
        get(),
        id,
        worktreeId,
        entry.path,
        'diff',
        isPreview,
        editorItemTargetGroupId
      )
    }
  }
}
