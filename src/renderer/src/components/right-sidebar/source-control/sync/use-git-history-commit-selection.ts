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
        const ids = current.ids.includes(item.id)
          ? current.ids.filter((id) => id !== item.id)
          : [...current.ids, item.id]
        setSelection({ result, ids, anchor: item.id })
        return true
      }
      if (current.ids.length > 0) {
        setSelection({ result, ids: [], anchor: item.id })
      } else if (current.anchor !== item.id) {
        setSelection({ result, ids: [], anchor: item.id })
      }
      return false
    },
    [current, result]
  )

  const itemsFor = useCallback(
    (item: GitHistoryItem): GitHistoryItem[] => {
      if (current.ids.length < 2 || !current.ids.includes(item.id)) {
        return [item]
      }
      const selected = new Set(current.ids)
      return (result?.items ?? []).filter((candidate) => selected.has(candidate.id))
    },
    [current, result]
  )

  const isSelected = useCallback((id: string) => current.ids.includes(id), [current])

  return { isSelected, handleRowClick, itemsFor }
}
