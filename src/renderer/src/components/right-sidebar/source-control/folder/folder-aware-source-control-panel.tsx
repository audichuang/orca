// Fork: routes a folder workspace to the multi-repo panel, everything else to upstream's panel.
import { useAppStore } from '@/store'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { SourceControlPanel } from '../panel/panel'
import { FolderMultiRepoPanel } from './folder-multi-repo-panel'
import { useSourceControlWorktreeScope } from './worktree-scope'

export function FolderAwareSourceControlPanel() {
  const scope = useSourceControlWorktreeScope()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  if (!scope && activeWorktreeId && parseWorkspaceKey(activeWorktreeId)?.type === 'folder') {
    return <FolderMultiRepoPanel key={activeWorktreeId} folderWorkspaceKey={activeWorktreeId} />
  }
  return <SourceControlPanel />
}
