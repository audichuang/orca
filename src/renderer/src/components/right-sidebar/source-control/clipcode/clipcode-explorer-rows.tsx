// Fork-only: upstream's explorer rows plus the ClipCode actions their context menus read.
import { useMemo } from 'react'
import type React from 'react'
import { FileExplorerVirtualRows } from '../../file-explorer/panel/FileExplorerVirtualRows'
import type { TreeNode } from '../../file-explorer/tree/file-explorer-types'
import { DuplicateAsResultRefreshContext } from '../../file-explorer-duplicate-as-result'
import { ClipcodeExplorerActionsContext } from './clipcode-actions-context'
import { copyClipcodeExplorerTargets } from './clipcode-copy-action'

export function ClipcodeExplorerVirtualRows({
  clipcodeWorktreePath,
  refreshDir,
  ...props
}: React.ComponentProps<typeof FileExplorerVirtualRows> & {
  clipcodeWorktreePath: string | null
  refreshDir?: (dirPath: string) => Promise<void>
}): React.JSX.Element {
  const { rowProjection, selectedPaths } = props
  const actions = useMemo(
    () =>
      clipcodeWorktreePath
        ? {
            // Why: same target set as Copy Paths — the multi-selection when the row is in it, else the row.
            copyNodeFullSource: (node: TreeNode) => {
              const selected = selectedPaths.has(node.path)
                ? rowProjection.getRowsByPaths(selectedPaths)
                : []
              void copyClipcodeExplorerTargets({
                worktreePath: clipcodeWorktreePath,
                targets: selected.length > 0 ? selected : [node]
              })
            }
          }
        : null,
    [clipcodeWorktreePath, rowProjection, selectedPaths]
  )
  return (
    <ClipcodeExplorerActionsContext.Provider value={actions}>
      <DuplicateAsResultRefreshContext.Provider value={refreshDir ?? null}>
        <FileExplorerVirtualRows {...props} />
      </DuplicateAsResultRefreshContext.Provider>
    </ClipcodeExplorerActionsContext.Provider>
  )
}
