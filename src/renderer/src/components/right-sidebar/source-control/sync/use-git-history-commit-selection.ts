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
  /**
   * `fallbackAnchorId`: the commit the caller shows as selected when no click in this hook has
   * (a restored selection); it anchors a Shift range and joins a Cmd/Ctrl-click.
   */
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
  // Why: a new result (refresh, branch filter) can reorder or drop commits; keep the commits it
  // still lists, so a selection survives a reload, and drop the ones it no longer has.
  const current = useMemo(() => {
    if (selection.result === result) {
      return selection
    }
    const listed = new Set((result?.items ?? []).map((item) => item.id))
    const keep = (id: string | null): string | null => (id !== null && listed.has(id) ? id : null)
    return {
      result,
      ids: selection.ids.filter((id) => listed.has(id)),
      anchor: keep(selection.anchor),
      plainClicked: keep(selection.plainClicked)
    }
  }, [result, selection])

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
        // Why: Cmd/Ctrl-click right after a plain click (or onto a restored selection) selects both,
        // like IntelliJ's log.
        const seed = current.plainClicked ?? fallbackAnchorId ?? null
        const base = current.ids.length === 0 && seed && seed !== item.id ? [seed] : current.ids
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
