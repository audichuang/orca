// Fork-only: Cmd/Ctrl-click and Shift-click selection of commits, for multi-commit Copy Full Source.
import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitHistoryForkCommitAction } from './git-history-commit-fork-menu'

export type GitHistoryCommitActionHandler = (
  action: GitHistoryForkCommitAction,
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
  /** What a remount needs to restore this selection (`retainAcrossResults.initial`). */
  snapshot: GitHistoryCommitSelectionSnapshot
}

export type GitHistoryCommitSelectionSnapshot = {
  ids: readonly string[]
  anchor: string | null
}

type SelectionState = {
  result: GitHistoryResult | undefined
  ownerKey: string | undefined
  ids: string[]
  anchor: string | null
  /** Row of the last plain click; a following Cmd/Ctrl-click folds it in (same as the file list). */
  plainClicked: string | null
}

function emptySelection(
  result: GitHistoryResult | undefined,
  ownerKey: string | undefined
): SelectionState {
  return { result, ownerKey, ids: [], anchor: null, plainClicked: null }
}

/** The selection limited to commits `result` still lists. */
function reconcileSelection(
  selection: SelectionState,
  result: GitHistoryResult | undefined
): SelectionState {
  const listed = new Set((result?.items ?? []).map((item) => item.id))
  const keep = (id: string | null): string | null => (id !== null && listed.has(id) ? id : null)
  return {
    result,
    ownerKey: selection.ownerKey,
    ids: selection.ids.filter((id) => listed.has(id)),
    anchor: keep(selection.anchor),
    plainClicked: keep(selection.plainClicked)
  }
}

export function useGitHistoryCommitSelection(
  result: GitHistoryResult | undefined,
  options?: {
    /**
     * Keep commits a new result still lists (refresh, branch filter) instead of starting over.
     * `ownerKey` names the repo owner; a different owner always starts over.
     */
    retainAcrossResults?: { ownerKey: string; initial?: GitHistoryCommitSelectionSnapshot }
  }
): GitHistoryCommitSelection {
  const ownerKey = options?.retainAcrossResults?.ownerKey
  const [selection, setSelection] = useState<SelectionState>(() => {
    const initial = options?.retainAcrossResults?.initial
    // Why not reconciled here: a remount's result is often still loading; the next result prunes it.
    return initial
      ? { ...emptySelection(result, ownerKey), ids: [...initial.ids], anchor: initial.anchor }
      : emptySelection(result, ownerKey)
  })
  // Why: a new result can reorder or drop commits, so a stale selection must not survive it as is.
  // A retained selection is pruned and stored, so a commit that disappears stays deselected.
  let current = selection
  if (selection.result !== result || selection.ownerKey !== ownerKey) {
    current =
      ownerKey !== undefined && selection.ownerKey === ownerKey
        ? reconcileSelection(selection, result)
        : emptySelection(result, ownerKey)
    setSelection(current)
  }

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
            ownerKey,
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
        // Cmd/Ctrl-clicking that same row deselects it: the toggle below removes it from the seed.
        const base = current.ids.length === 0 && seed ? [seed] : current.ids
        const ids = base.includes(item.id)
          ? base.filter((id) => id !== item.id)
          : [...base, item.id]
        setSelection({ result, ownerKey, ids, anchor: item.id, plainClicked: null })
        return true
      }
      if (current.ids.length > 0 || current.plainClicked !== item.id) {
        setSelection({ result, ownerKey, ids: [], anchor: item.id, plainClicked: item.id })
      }
      return false
    },
    [current, ownerKey, result]
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
  const snapshot = useMemo(
    () => ({ ids: current.ids, anchor: current.anchor }),
    [current.ids, current.anchor]
  )

  return { isSelected, handleRowClick, itemsFor, selectedItems, snapshot }
}
