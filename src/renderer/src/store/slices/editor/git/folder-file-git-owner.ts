import { getFolderGitWorktrees } from '@/components/right-sidebar/source-control/folder/folder-git-worktrees'
import { getIndexedAllWorktrees, getIndexedRepoMap } from '../../../worktree-repo-index'
import type { AppState } from '../../../types'
import type { OpenFile } from '../types/open-file'
import { relativePathInsideRoot } from '../../../../../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { selectFolderWorkspaces, selectWorktreesByRepo } from '@/store/workspace-record-selectors'

type FolderFileGitOwner = { gitWorktreeId: string; relativePath: string }

/** Repo worktree under a folder workspace that holds `filePath`; the deepest one wins for nested repos. */
export function resolveFolderFileGitOwner(
  state: Pick<AppState, 'folderWorkspaces' | 'worktreesByRepo' | 'repos'>,
  worktreeId: string,
  filePath: string
): FolderFileGitOwner | null {
  const scope = parseWorkspaceKey(worktreeId)
  if (scope?.type !== 'folder') {
    return null
  }
  // Why: partial test/mirror states can omit folder workspaces entirely.
  const folderWorkspace = selectFolderWorkspaces(state)?.find(
    (w) => w.id === scope.folderWorkspaceId
  )
  if (!folderWorkspace) {
    return null
  }
  let best: (FolderFileGitOwner & { depth: number }) | null = null
  const members = getFolderGitWorktrees(
    folderWorkspace,
    getIndexedAllWorktrees(selectWorktreesByRepo(state)),
    getIndexedRepoMap(state.repos)
  )
  for (const { worktree } of members) {
    const relativePath = relativePathInsideRoot(worktree.path, filePath)
    if (!relativePath) {
      continue
    }
    const depth = worktree.path.length
    if (!best || depth > best.depth) {
      best = { gitWorktreeId: worktree.id, relativePath, depth }
    }
  }
  return best ? { gitWorktreeId: best.gitWorktreeId, relativePath: best.relativePath } : null
}

/** Folder-workspace opens that arrive without a git owner (Explorer, links, quick open) bind to the repo holding the file. */
export function withFolderFileGitOwner<
  T extends Pick<
    OpenFile,
    'filePath' | 'worktreeId' | 'gitWorktreeId' | 'relativePath' | 'mode' | 'isUntitled'
  >
>(state: Pick<AppState, 'folderWorkspaces' | 'worktreesByRepo' | 'repos'>, file: T): T {
  // Why: untitled notes are folder-scoped placeholders; cleanup deletes them by the tab owner's relative path.
  if (file.gitWorktreeId !== undefined || file.mode !== 'edit' || file.isUntitled) {
    return file
  }
  const owner = resolveFolderFileGitOwner(state, file.worktreeId, file.filePath)
  return owner ? { ...file, ...owner } : file
}
