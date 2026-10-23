// Fork-only: which Git Graph row wraps its whole subject, timed so rows never move under a click.
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Why: rows above a click must not shrink before a double-click's second press lands on the same row.
export const GIT_GRAPH_EXPAND_AFTER_CLICK_MS = 500

function rowElement(list: HTMLElement | null, id: string | null): HTMLElement | null {
  return id ? (list?.querySelector<HTMLElement>(`[data-commit-id="${id}"]`) ?? null) : null
}

/**
 * The cursor row (when selected) wraps its subject. After a click the previously wrapped row
 * stays as it is until a double-click could have landed; a key move switches at once. Each switch
 * then scrolls just enough to show the wrapped row.
 */
export function useGitGraphExpandedRow(
  listRef: RefObject<HTMLElement | null>,
  targetId: string | null
): { expandedId: string | null; notePointerSelect: () => void; noteKeySelect: () => void } {
  // Set while a click settles: the row that keeps its wrap until then.
  const [held, setHeld] = useState<{ id: string | null } | null>(null)
  const expandedId = held ? held.id : targetId
  const latestRef = useRef({ expandedId, targetId })
  const timerRef = useRef<number | undefined>(undefined)
  const anchorRef = useRef<{ id: string; top: number; reveal: boolean } | null>(null)

  useLayoutEffect(() => {
    latestRef.current = { expandedId, targetId }
  })

  useLayoutEffect(() => {
    const list = listRef.current
    const row = rowElement(list, expandedId)
    const anchor = anchorRef.current
    anchorRef.current = null
    if (!list || !row) {
      return
    }
    if (anchor?.id === expandedId) {
      // Why: rows above that just collapsed would otherwise pull the clicked row up under the pointer.
      list.scrollTop += row.getBoundingClientRect().top - anchor.top
    }
    const rowBox = row.getBoundingClientRect()
    const listBox = list.getBoundingClientRect()
    const overflowBelow = rowBox.bottom - listBox.bottom
    // Why skip without reveal: the user scrolled the clicked row away while the click settled.
    if (overflowBelow > 0 && (anchor?.reveal ?? true)) {
      // Why capped at the top: a row taller than the list keeps its first line in view.
      list.scrollTop += Math.min(overflowBelow, rowBox.top - listBox.top)
    }
  }, [expandedId, listRef])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const notePointerSelect = useCallback(() => {
    window.clearTimeout(timerRef.current)
    setHeld((current) => current ?? { id: latestRef.current.expandedId })
    timerRef.current = window.setTimeout(() => {
      const target = latestRef.current.targetId
      const list = listRef.current
      const row = rowElement(list, target)
      if (target && row && list) {
        const rowBox = row.getBoundingClientRect()
        const listBox = list.getBoundingClientRect()
        const reveal = rowBox.bottom > listBox.top && rowBox.top < listBox.bottom
        anchorRef.current = { id: target, top: rowBox.top, reveal }
      } else {
        anchorRef.current = null
      }
      setHeld(null)
    }, GIT_GRAPH_EXPAND_AFTER_CLICK_MS)
  }, [listRef])

  const noteKeySelect = useCallback(() => {
    window.clearTimeout(timerRef.current)
    setHeld(null)
  }, [])

  return { expandedId, notePointerSelect, noteKeySelect }
}
