import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/slices/worktrees/listing/use-worktree-catalog'
import { selectFolderWorkspaces } from '@/store/workspaces/catalog/workspace-record-fields'
import type { FolderWorkspace } from '../../../../../../shared/folder-workspaces/folder-workspace-types'
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
  const repos = useAppStore((s) => s.repos)
  const members = useMemo(
    () => (folderWorkspace ? getFolderGitWorktrees(folderWorkspace, worktrees, repos) : []),
    [folderWorkspace, repos, worktrees]
  )
  return { folderWorkspace, members }
}
