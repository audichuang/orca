import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useAllWorktrees, useRepoMap } from '@/store/selectors'
import { selectFolderWorkspaces } from '@/store/workspace-record-selectors'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspace-types'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { getFolderGitWorktrees, type FolderGitWorktree } from './folder-git-worktrees'

/** Git members of a folder workspace key; empty for a worktree key or a folder that is gone. */
export function useFolderGitMembers(workspaceKey: string): {
  folderWorkspace: FolderWorkspace | null
  members: FolderGitWorktree[]
} {
  const scope = parseWorkspaceKey(workspaceKey)
  const folderWorkspaceId = scope?.type === 'folder' ? scope.folderWorkspaceId : null
  const folderWorkspace = useAppStore(
    (s) => selectFolderWorkspaces(s).find((workspace) => workspace.id === folderWorkspaceId) ?? null
  )
  const worktrees = useAllWorktrees()
  const repoById = useRepoMap()
  const members = useMemo(
    () => (folderWorkspace ? getFolderGitWorktrees(folderWorkspace, worktrees, repoById) : []),
    [folderWorkspace, repoById, worktrees]
  )
  return { folderWorkspace, members }
}
