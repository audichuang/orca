import { ClipboardPaste, Copy, FolderPlus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { ActionButton } from '../listing/action-button'
import { GitGraphOpenButton } from '../sync/git-graph-tab-launcher'

/** Folder name and folder-wide actions above a folder workspace's repo headers. */
export function FolderRepoPanelToolbar({
  name,
  folderPath,
  workspaceKey,
  selectedRepoId,
  onCopyAll,
  onAddRepos,
  onRestore,
  onRefresh
}: {
  name: string
  folderPath: string
  workspaceKey: string
  /** Repo the Git Graph button opens on; the graph can still switch to the others. */
  selectedRepoId: string
  onCopyAll: () => void
  /** Undefined hides the action, e.g. for folders on SSH hosts. */
  onAddRepos?: () => void
  onRestore: () => void
  onRefresh: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border pl-3 pr-2 py-1">
      <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={folderPath}>
        {name}
      </span>
      <GitGraphOpenButton workspaceId={workspaceKey} repoWorktreeId={selectedRepoId} />
      <ActionButton
        icon={Copy}
        title={translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.d98e7b731c',
          'Copy all changes'
        )}
        onClick={onCopyAll}
      />
      {onAddRepos && (
        <ActionButton
          icon={FolderPlus}
          title={translate(
            'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.addRepos',
            'Add repositories in this folder'
          )}
          onClick={onAddRepos}
        />
      )}
      <ActionButton
        icon={ClipboardPaste}
        title={translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.da953a696f',
          'Paste & Restore'
        )}
        onClick={onRestore}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRefresh}
        aria-label={translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.a044a830f1',
          'Refresh all repositories'
        )}
        title={translate(
          'auto.components.right.sidebar.source.control.folder.folder.multi.repo.panel.a044a830f1',
          'Refresh all repositories'
        )}
      >
        <RefreshCw />
      </Button>
    </div>
  )
}
