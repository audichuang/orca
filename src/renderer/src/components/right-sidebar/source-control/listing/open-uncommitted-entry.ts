import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { AppState } from '@/store/types'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'

export function openUncommittedEntry(
  state: Pick<AppState, 'trackConflictPath' | 'openConflictFile' | 'openFile' | 'openDiff'>,
  worktreeId: string,
  worktreePath: string,
  entry: GitStatusEntry,
  options: Parameters<AppState['openDiff']>[5] = {},
  // Why: a folder workspace opens the tab in the folder while git and conflict tracking stay on the repo.
  tabWorktreeId: string = worktreeId
): void {
  const language = detectLanguage(entry.path)
  if (entry.conflictKind && entry.conflictStatus) {
    if (entry.conflictStatus === 'unresolved') {
      state.trackConflictPath(worktreeId, entry.path, entry.conflictKind)
    }
    state.openConflictFile(tabWorktreeId, worktreePath, entry, language, options)
    return
  }
  const filePath = joinPath(worktreePath, entry.path)
  if (
    language === 'markdown' &&
    entry.area !== 'staged' &&
    (entry.status === 'added' || entry.status === 'untracked')
  ) {
    state.openFile(
      {
        filePath,
        relativePath: entry.path,
        worktreeId: tabWorktreeId,
        gitWorktreeId: options.gitWorktreeId,
        language,
        mode: 'edit'
      },
      options
    )
    return
  }
  state.openDiff(tabWorktreeId, filePath, entry.path, language, entry.area === 'staged', options)
}
