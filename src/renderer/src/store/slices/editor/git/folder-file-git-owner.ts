import { getFolderGitWorktrees } from '@/components/right-sidebar/source-control/folder/folder-git-worktrees'
import { getIndexedAllWorktrees } from '../../worktrees/listing/worktree-catalog-index'
import { getIndexedRepoMap } from '@/store/repos/repository-catalog-index'
import type { AppState } from '../../../types'
import type { OpenFile } from '../types/open-file'
import {
  isRuntimePathAbsolute,
  relativePathInsideRoot
} from '../../../../../../shared/cross-platform-path'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { selectFolderWorkspaces } from '@/store/workspaces/catalog/workspace-record-fields'
import { selectWorktreesByRepo } from '@/store/workspaces/catalog/workspace-record-fields'
import { resolveTabOwnerRelativePath } from './open-file-git-owner'

type FolderFileGitOwner = { gitWorktreeId: string }

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
    if (!relativePathInsideRoot(worktree.path, filePath)) {
      continue
    }
    const depth = worktree.path.length
    if (!best || depth > best.depth) {
      best = { gitWorktreeId: worktree.id, depth }
    }
  }
  return best ? { gitWorktreeId: best.gitWorktreeId } : null
}

/**
 * Edit tabs keep relativePath relative to worktreeId, as upstream reads it. Folder opens without a
 * git owner (Explorer, links, quick open) bind to the repo holding the file; Source Control opens
 * with a repo-relative path are re-anchored to the folder root when the file lies inside it.
 */
export function withFolderFileGitOwner<
  T extends Pick<
    OpenFile,
    | 'filePath'
    | 'worktreeId'
    | 'gitWorktreeId'
    | 'relativePath'
    | 'mode'
    | 'isUntitled'
    | 'runtimeEnvironmentId'
  >
>(state: Pick<AppState, 'folderWorkspaces' | 'worktreesByRepo' | 'repos'>, file: T): T {
  // Why: untitled notes are folder-scoped placeholders; cleanup deletes them by the tab owner's relative path.
  if (file.mode !== 'edit' || file.isUntitled) {
    return file
  }
  if (file.gitWorktreeId !== undefined) {
    // Why: outside the folder root there is no folder-relative path, so the repo-relative one stays.
    const relativePath = resolveTabOwnerRelativePath(state, file, null)
    return relativePath && relativePath !== file.relativePath ? { ...file, relativePath } : file
  }
  // Why: an absolute tab stays unbound so upstream's same-workspace re-own still matches its reads.
  if (isRuntimePathAbsolute(file.relativePath)) {
    return file
  }
  const owner = resolveFolderFileGitOwner(state, file.worktreeId, file.filePath)
  return owner ? { ...file, gitWorktreeId: owner.gitWorktreeId } : file
}

/** The owner and path an open binds to once its host is resolved. */
export function bindFolderFileGitOwner(
  state: Pick<AppState, 'folderWorkspaces' | 'worktreesByRepo' | 'repos'>,
  file: Parameters<typeof withFolderFileGitOwner>[1],
  runtimeEnvironmentId: string | null | undefined
): Pick<OpenFile, 'relativePath' | 'gitWorktreeId'> {
  const { relativePath, gitWorktreeId } = withFolderFileGitOwner(state, {
    ...file,
    runtimeEnvironmentId
  })
  return { relativePath, gitWorktreeId }
}
