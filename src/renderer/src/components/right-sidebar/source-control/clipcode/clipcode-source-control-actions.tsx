// Fork-only: provides Copy Full Source to the source control panel's menu items, bulk bar and section headers.
import { useCallback, useMemo } from 'react'
import type React from 'react'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import { useSourceControlWorktreeScope } from '../folder/worktree-scope'
import type { FlatEntry } from '../listing/use-selection'
import type { SourceControlPanelModel } from '../panel/use-panel-model'
import { copyClipcodeGitChanges, getClipcodeRootPath } from './clipcode-copy-action'
import { ClipcodeSourceControlActionsContext } from './clipcode-actions-context'

/** Copy Full Source handlers for the single-repo panel: selection, one row's menu, or a whole section. */
function useClipcodeFullSourceCopy({
  worktreeId,
  worktreePath,
  selectedKeys,
  flatEntriesByKey
}: {
  worktreeId: string | null
  worktreePath: string | null
  selectedKeys: ReadonlySet<string>
  flatEntriesByKey: ReadonlyMap<string, FlatEntry>
}): {
  copyRowFullSource: (rowKey: string) => void
  copySelectionFullSource: () => void
  copySectionFullSource: (entries: readonly GitStatusEntry[], area: GitStatusEntry['area']) => void
} {
  const editorWorktreeId = useSourceControlWorktreeScope()?.editorWorktreeId ?? null

  const copyEntries = useCallback(
    (entries: readonly GitStatusEntry[], forceIndexForStaged: boolean) => {
      if (!worktreeId || !worktreePath || entries.length === 0) {
        return
      }
      void copyClipcodeGitChanges({
        rootPath: getClipcodeRootPath(editorWorktreeId, worktreePath),
        requests: [
          { worktree: { id: worktreeId, path: worktreePath }, entries, forceIndexForStaged }
        ]
      })
    },
    [editorWorktreeId, worktreeId, worktreePath]
  )

  const copySelectionFullSource = useCallback(() => {
    const entries = [...selectedKeys].flatMap((key) => flatEntriesByKey.get(key)?.entry ?? [])
    copyEntries(entries, true)
  }, [copyEntries, flatEntriesByKey, selectedKeys])

  // Why: a right-click on an unselected row retargets the selection to that row, so only a selected row means "the selection".
  const copyRowFullSource = useCallback(
    (rowKey: string) => {
      if (selectedKeys.has(rowKey)) {
        copySelectionFullSource()
        return
      }
      const entry = flatEntriesByKey.get(rowKey)?.entry
      if (entry) {
        copyEntries([entry], true)
      }
    },
    [copyEntries, copySelectionFullSource, flatEntriesByKey, selectedKeys]
  )

  const copySectionFullSource = useCallback(
    (entries: readonly GitStatusEntry[], area: GitStatusEntry['area']) =>
      copyEntries(entries, area === 'staged'),
    [copyEntries]
  )

  return { copyRowFullSource, copySelectionFullSource, copySectionFullSource }
}

/** Mounted once around a repo's panel; the items it serves render nothing without it. */
export function ClipcodeSourceControlActionsProvider({
  model,
  children
}: {
  model: Pick<
    SourceControlPanelModel,
    'activeWorktreeId' | 'worktreePath' | 'selectedKeys' | 'flatEntriesByKey' | 'repositoryHuge'
  >
  children: React.ReactNode
}): React.JSX.Element {
  const { copyRowFullSource, copySelectionFullSource, copySectionFullSource } =
    useClipcodeFullSourceCopy({
      worktreeId: model.activeWorktreeId,
      worktreePath: model.worktreePath,
      selectedKeys: model.selectedKeys,
      flatEntriesByKey: model.flatEntriesByKey
    })
  const isStatusTruncated = model.repositoryHuge !== undefined
  const value = useMemo(
    () => ({
      copyRowFullSource,
      copySelectionFullSource,
      copySectionFullSource,
      isStatusTruncated
    }),
    [copyRowFullSource, copySelectionFullSource, copySectionFullSource, isStatusTruncated]
  )
  return (
    <ClipcodeSourceControlActionsContext.Provider value={value}>
      {children}
    </ClipcodeSourceControlActionsContext.Provider>
  )
}
