// Fork-only: lands focus on the full Git Graph's commit list once, when it opens.
import type React from 'react'
import { useEffect, useRef } from 'react'

/**
 * The first pass takes focus (opening the graph is the gesture). Later passes, run when history
 * arrives, only take focus still parked on the loading placeholder or nowhere: a tab, unlike the
 * old dialog, sits beside other panes the user may have moved to meanwhile.
 */
export function useGitGraphOpenFocus(
  listRef: React.RefObject<HTMLDivElement | null>,
  cursorId: string | null | undefined
): void {
  const doneRef = useRef(false)
  const startedRef = useRef(false)
  useEffect(() => {
    const list = listRef.current
    if (doneRef.current || !list) {
      return
    }
    const active = document.activeElement
    const parked = !active || active === document.body || active === list
    const root = list.closest('[data-git-graph-root]')
    if (!parked && (startedRef.current || root?.contains(active))) {
      doneRef.current = true
      return
    }
    startedRef.current = true
    const row = list.querySelector<HTMLElement>('[tabindex="0"]')
    if (row) {
      doneRef.current = true
      row.focus({ preventScroll: true })
    } else {
      // Placeholder while history loads; a later row may take over only from here.
      list.focus({ preventScroll: true })
    }
  }, [cursorId, listRef])
}
