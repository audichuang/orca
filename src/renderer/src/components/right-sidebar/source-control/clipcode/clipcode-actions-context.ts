// Fork-only: ClipCode copy actions the source control panel and the file explorer provide to their menu items.
import { createContext, useContext } from 'react'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { TreeNode } from '../../file-explorer-types'

export type ClipcodeSourceControlActions = {
  copyRowFullSource: (rowKey: string) => void
  copySelectionFullSource: () => void
  copySectionFullSource: (entries: readonly GitStatusEntry[], area: GitStatusEntry['area']) => void
  /** A capped listing cannot name every file, so a section copy would copy a partial set. */
  isStatusTruncated: boolean
}

export type ClipcodeExplorerActions = {
  copyNodeFullSource: (node: TreeNode) => void
}

export const ClipcodeSourceControlActionsContext =
  createContext<ClipcodeSourceControlActions | null>(null)

export const ClipcodeExplorerActionsContext = createContext<ClipcodeExplorerActions | null>(null)

export function useClipcodeSourceControlActions(): ClipcodeSourceControlActions | null {
  return useContext(ClipcodeSourceControlActionsContext)
}

export function useClipcodeExplorerActions(): ClipcodeExplorerActions | null {
  return useContext(ClipcodeExplorerActionsContext)
}
