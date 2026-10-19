// Fork-only: Cmd/Ctrl-click and Shift-click selection of commits, for multi-commit Copy Full Source.
import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitHistoryCommitAction } from './git-history-commit-context-menu'

export type GitHistoryCommitActionHandler = (
  action: GitHistoryCommitAction,
  item: GitHistoryItem,
  selectedItems?: readonly GitHistoryItem[]
) => void

function isMacPlatform(): boolean {
  return navigator.userAgent.includes('Mac')
}

export type GitHistoryCommitSelection = {
  isSelected: (id: string) => boolean
  /** Returns true when the click was a selection gesture, so the row must not also expand. */
  handleRowClick: (item: GitHistoryItem, event: MouseEvent) => boolean
  /** The selection when it covers the right-clicked commit, else just that commit. */
  itemsFor: (item: GitHistoryItem) => GitHistoryItem[]
  /** Explicitly selected commits in graph order; empty after a plain click. */
  selectedItems: readonly GitHistoryItem[]
}

export function useGitHistoryCommitSelection(
  result: GitHistoryResult | undefined
): GitHistoryCommitSelection {
  const [selection, setSelection] = useState<{
    result: GitHistoryResult | undefined
    ids: string[]
    anchor: string | null
  }>({ result, ids: [], anchor: null })
  // Why: a new result can reorder or drop commits, so a stale selection must not survive it.
  const current = useMemo(
    () => (selection.result === result ? selection : { result, ids: [], anchor: null }),
    [result, selection]
  )

  const handleRowClick = useCallback(
    (item: GitHistoryItem, event: MouseEvent): boolean => {
      const items = result?.items ?? []
      const toggle = isMacPlatform() ? event.metaKey : event.ctrlKey
      if (event.shiftKey && current.anchor) {
        const from = items.findIndex((candidate) => candidate.id === current.anchor)
        const to = items.findIndex((candidate) => candidate.id === item.id)
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from]
          setSelection({
            result,
            ids: items.slice(start, end + 1).map((candidate) => candidate.id),
            anchor: current.anchor
          })
          return true
        }
      }
      if (toggle) {
        // Why fold in the anchor: Cmd/Ctrl-click after a plain click selects both, like IntelliJ's log.
        const base =
          current.ids.length === 0 && current.anchor && current.anchor !== item.id
            ? [current.anchor]
            : current.ids
        const ids = base.includes(item.id)
          ? base.filter((id) => id !== item.id)
          : [...base, item.id]
        setSelection({ result, ids, anchor: item.id })
        return true
      }
      if (current.ids.length > 0 || current.anchor !== item.id) {
        setSelection({ result, ids: [], anchor: item.id })
      }
      return false
    },
    [current, result]
  )

  // Why precomputed: every row asks on each render, and a Shift range can cover a thousand commits.
  const selectedIds = useMemo(() => new Set(current.ids), [current])
  const selectedItems = useMemo(
    () => (result?.items ?? []).filter((candidate) => selectedIds.has(candidate.id)),
    [result, selectedIds]
  )
  const itemsFor = useCallback(
    (item: GitHistoryItem): GitHistoryItem[] =>
      selectedItems.length < 2 || !selectedIds.has(item.id) ? [item] : selectedItems,
    [selectedIds, selectedItems]
  )
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  return { isSelected, handleRowClick, itemsFor, selectedItems }
}
