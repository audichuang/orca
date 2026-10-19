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

export type CommitClickModifiers = Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>

export type GitHistoryCommitSelection = {
  isSelected: (id: string) => boolean
  /** Returns true when the click was a selection gesture, so the row must not also expand. */
  /** `fallbackAnchorId` starts a Shift range when no click has set an anchor yet (e.g. a restored selection). */
  handleRowClick: (
    item: GitHistoryItem,
    event: CommitClickModifiers,
    fallbackAnchorId?: string | null
  ) => boolean
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
    /** Row of the last plain click; a following Cmd/Ctrl-click folds it in (same as the file list). */
    plainClicked: string | null
  }>({ result, ids: [], anchor: null, plainClicked: null })
  // Why: a new result can reorder or drop commits, so a stale selection must not survive it.
  const current = useMemo(
    () =>
      selection.result === result
        ? selection
        : { result, ids: [], anchor: null, plainClicked: null },
    [result, selection]
  )

  const handleRowClick = useCallback(
    (
      item: GitHistoryItem,
      event: CommitClickModifiers,
      fallbackAnchorId?: string | null
    ): boolean => {
      const items = result?.items ?? []
      const toggle = isMacPlatform() ? event.metaKey : event.ctrlKey
      const anchor = current.anchor ?? fallbackAnchorId ?? null
      if (event.shiftKey && anchor) {
        const from = items.findIndex((candidate) => candidate.id === anchor)
        const to = items.findIndex((candidate) => candidate.id === item.id)
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from]
          setSelection({
            result,
            ids: items.slice(start, end + 1).map((candidate) => candidate.id),
            anchor,
            plainClicked: null
          })
          return true
        }
      }
      if (toggle) {
        // Why: Cmd/Ctrl-click right after a plain click selects both, like IntelliJ's log.
        const base =
          current.ids.length === 0 && current.plainClicked && current.plainClicked !== item.id
            ? [current.plainClicked]
            : current.ids
        const ids = base.includes(item.id)
          ? base.filter((id) => id !== item.id)
          : [...base, item.id]
        setSelection({ result, ids, anchor: item.id, plainClicked: null })
        return true
      }
      if (current.ids.length > 0 || current.plainClicked !== item.id) {
        setSelection({ result, ids: [], anchor: item.id, plainClicked: item.id })
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
