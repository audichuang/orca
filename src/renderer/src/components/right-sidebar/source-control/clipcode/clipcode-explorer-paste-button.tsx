import { useMemo } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getFileExplorerOperationOwnerFromState } from '../../file-explorer-operation-owner'
import { useFolderGitMembers } from '../folder/use-folder-git-members'
import { useClipcodeRestore } from './use-clipcode-restore'

// Reuses the preview dialog's title key so the button needs no new locale entry.
const PASTE_RESTORE_KEY =
  'auto.components.right.sidebar.source.control.clipcode.clipcode.restore.preview.dialog.2c06a4e179'

function ExplorerPasteButton({
  workspaceKey,
  rootPath,
  onRestored
}: {
  workspaceKey: string
  rootPath: string
  onRestored: () => void
}): React.JSX.Element | null {
  const ownerUnresolved = useAppStore(
    (s) => getFileExplorerOperationOwnerFromState(s, workspaceKey).kind === 'unresolved'
  )
  // Folder workspaces also hold files in member repo tabs; any other key yields no members.
  const { members } = useFolderGitMembers(workspaceKey)
  const repoWorktrees = useMemo(
    () => members.map((member) => ({ id: member.worktree.id, path: member.worktree.path })),
    [members]
  )
  const { requestRestore, dialog } = useClipcodeRestore({
    workspaceKey,
    rootPath,
    repoWorktrees,
    onRestored
  })
  if (ownerUnresolved) {
    return null
  }
  const label = translate(PASTE_RESTORE_KEY, 'Paste & Restore')
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            aria-label={label}
            onClick={requestRestore}
          >
            <ClipboardPaste className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
      {dialog}
    </>
  )
}

/** Explorer header action: ClipCode Paste & Restore into the workspace root. */
export function ClipcodeExplorerPasteButton({
  workspaceKey,
  rootPath,
  onRestored
}: {
  workspaceKey: string | null
  rootPath: string
  onRestored: () => void
}): React.JSX.Element | null {
  // Why: FileExplorer keeps this instance across same-host workspaces; remount so a pending or open restore never writes into the previous root.
  return workspaceKey ? (
    <ExplorerPasteButton
      key={`${workspaceKey}\u0000${rootPath}`}
      workspaceKey={workspaceKey}
      rootPath={rootPath}
      onRestored={onRestored}
    />
  ) : null
}
