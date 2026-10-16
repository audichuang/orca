import { useAppStore } from '@/store'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { FolderMultiRepoPanel } from '../folder/folder-multi-repo-panel'
import { useSourceControlWorktreeScope } from '../folder/worktree-scope'
import { SourceControlSingleRepoPanel } from './single-repo-panel'

/** Folder workspaces list the git repos under them; every other workspace shows its own repo. */
export function SourceControlPanel() {
  const scope = useSourceControlWorktreeScope()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  if (!scope && activeWorktreeId && parseWorkspaceKey(activeWorktreeId)?.type === 'folder') {
    return <FolderMultiRepoPanel key={activeWorktreeId} folderWorkspaceKey={activeWorktreeId} />
  }
  return <SourceControlSingleRepoPanel />
}
