// Fork-only: roving keyboard focus for a folder workspace's repo rows.
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/** visibleIds is the drawn row order, so the nth-row lookup matches what is on screen. */
export function useFolderRepoRowFocus(visibleIds: readonly string[], selectedId: string) {
  const listRef = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const rovingId =
    focusId !== null && visibleIds.includes(focusId)
      ? focusId
      : visibleIds.includes(selectedId)
        ? selectedId
        : visibleIds[0]
  const pendingFocusRef = useRef<string | null>(null)
  const focusRow = useCallback(
    (id: string) => {
      listRef.current
        ?.querySelectorAll<HTMLElement>('[data-repo-row]')
        [visibleIds.indexOf(id)]?.focus()
    },
    [visibleIds]
  )
  // Why: toggling reorders the keyed rows (filter cleared, row folded away), and Chromium blurs a moved node.
  useLayoutEffect(() => {
    const id = pendingFocusRef.current
    if (id === null) {
      return
    }
    pendingFocusRef.current = null
    if (rovingId === undefined) {
      // Why: closing the last shown repo folds every row away; land on its group header instead.
      listRef.current?.querySelector<HTMLElement>('[data-folder-repo-list] button')?.focus()
      return
    }
    focusRow(visibleIds.includes(id) ? id : rovingId)
  })
  const focusRepo = (id: string) => {
    setFocusId(id)
    focusRow(id)
  }
  /** Call before a toggle re-renders the list, so focus follows the row to its new place. */
  const keepFocusAfterToggle = (id: string) => {
    pendingFocusRef.current = id
    setFocusId(id)
  }
  return { listRef, rovingId, focusRepo, keepFocusAfterToggle }
}
