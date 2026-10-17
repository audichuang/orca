import { joinPath } from '@/lib/path'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import type { EditorPathMutationTarget } from '../../editor-autosave'

/** Repo-relative section path for a watch event; a folder workspace reports paths relative to the folder, not the diff's repo. */
export function resolveCombinedDiffChangedSectionPath(
  diffRootPath: string,
  change: Pick<EditorPathMutationTarget, 'worktreePath' | 'relativePath'>
): string | null {
  return (
    relativePathInsideRoot(diffRootPath, joinPath(change.worktreePath, change.relativePath)) || null
  )
}
