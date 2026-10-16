import type { EditorGet, EditorSet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'
import { joinPath } from '@/lib/path'
import { resolveEditorFileIdForOwner } from '../file-ids/editor-file-ids'
import type { OpenFile } from '../types/open-file'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../../../../shared/layout-owner-switch'
import { recordReopenedEditorFileInLayoutOwner } from '../tabs/editor-tab-layout-owner'
import { toOpenConflictMetadata } from '../git/git-status-reconciliation'
import { resolveEditorOpenTargetGroupId } from '../tabs/editor-open-target-group'
import { resolveEditorPreviewIntent } from '../tabs/editor-preview-tab-setting'
import {
  getReplaceablePreviewFileId,
  openWorkspaceEditorItem,
  removeEditorStateForReplacedPreview
} from '../tabs/workspace-editor-item'

export function createOpenConflictFile(
  set: EditorSet,
  get: EditorGet
): Pick<EditorSlice, 'openConflictFile'> {
  return {
    openConflictFile: (worktreeId, worktreePath, entry, language, options) => {
      const absolutePath = joinPath(worktreePath, entry.path)
      const isPreview = resolveEditorPreviewIntent(get(), options?.preview)
      let editorItemTargetGroupId = options?.targetGroupId
      const gitWorktreeId =
        options?.gitWorktreeId !== worktreeId ? options?.gitWorktreeId : undefined
      const trackedKey = gitWorktreeId ?? worktreeId
      let openedConflictFile = true
      const before = ORCA_LAYOUT_OWNER_IS_MAIN ? get() : null
      let editorFileId = absolutePath
      set((s) => {
        const id = resolveEditorFileIdForOwner(s, absolutePath, worktreeId, undefined, ['edit'])
        editorFileId = id
        const conflict = toOpenConflictMetadata(entry)
        const targetGroupId =
          resolveEditorOpenTargetGroupId(s, worktreeId, options?.targetGroupId) ?? undefined
        editorItemTargetGroupId = targetGroupId
        const existing = s.openFiles.find((f) => f.id === id)
        const nextTracked =
          entry.conflictStatus === 'unresolved' && entry.conflictKind
            ? {
                ...s.trackedConflictPathsByWorktree[trackedKey],
                [entry.path]: entry.conflictKind
              }
            : s.trackedConflictPathsByWorktree[trackedKey]

        if (!conflict) {
          openedConflictFile = false
          return s
        }

        if (existing) {
          const updatedPreview = isPreview ? existing.isPreview : false
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    mode: 'edit' as const,
                    language,
                    relativePath: entry.path,
                    filePath: absolutePath,
                    conflict,
                    diffSource: undefined,
                    skippedConflicts: undefined,
                    conflictReview: undefined,
                    gitWorktreeId: gitWorktreeId ?? f.gitWorktreeId,
                    isPreview: updatedPreview
                  }
                : f
            ),
            activeFileId: id,
            activeTabType: 'editor',
            activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
            activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' },
            trackedConflictPathsByWorktree:
              nextTracked === s.trackedConflictPathsByWorktree[trackedKey]
                ? s.trackedConflictPathsByWorktree
                : { ...s.trackedConflictPathsByWorktree, [trackedKey]: nextTracked }
          }
        }

        const newFile: OpenFile = {
          id,
          filePath: absolutePath,
          relativePath: entry.path,
          worktreeId,
          gitWorktreeId,
          language,
          isDirty: false,
          mode: 'edit',
          conflict,
          isPreview: isPreview || undefined
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
              activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' },
              trackedConflictPathsByWorktree:
                nextTracked === s.trackedConflictPathsByWorktree[trackedKey]
                  ? s.trackedConflictPathsByWorktree
                  : { ...s.trackedConflictPathsByWorktree, [trackedKey]: nextTracked }
            }
          }
        }

        return {
          openFiles: [...s.openFiles, newFile],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' },
          trackedConflictPathsByWorktree:
            nextTracked === s.trackedConflictPathsByWorktree[trackedKey]
              ? s.trackedConflictPathsByWorktree
              : { ...s.trackedConflictPathsByWorktree, [trackedKey]: nextTracked }
        }
      })
      // Why: no conflict metadata means no OpenFile was added, so a workspace tab would point at nothing.
      if (!openedConflictFile) {
        return
      }
      const tabId = openWorkspaceEditorItem(
        get(),
        editorFileId,
        worktreeId,
        entry.path,
        'editor',
        isPreview,
        editorItemTargetGroupId
      )
      if (ORCA_LAYOUT_OWNER_IS_MAIN && before) {
        recordReopenedEditorFileInLayoutOwner(before, get(), worktreeId, tabId)
      }
    }
  }
}
