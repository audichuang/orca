// Fork-only: roving keyboard focus for a folder workspace's repo rows.
import { type FocusEvent, useCallback, useLayoutEffect, useReducer, useRef, useState } from 'react'

function rowIdOf(element: EventTarget | null): string | null {
  return element instanceof HTMLElement && element.hasAttribute('data-repo-row')
    ? (element.dataset.repoRowId ?? null)
    : null
}

function isFocusLost(): boolean {
  const active = document.activeElement
  return active === null || active === document.body || !active.isConnected
}

/** The remaining row closest to where `id` sat in the previous order, preferring the one after it. */
function nearestRemainingRow(
  previousIds: readonly string[],
  visibleIds: readonly string[],
  id: string
): string | undefined {
  const at = previousIds.indexOf(id)
  for (let distance = 1; at !== -1 && distance < previousIds.length; distance++) {
    for (const candidate of [previousIds[at + distance], previousIds[at - distance]]) {
      if (candidate !== undefined && visibleIds.includes(candidate)) {
        return candidate
      }
    }
  }
  return visibleIds[0]
}

/** visibleIds is the drawn row order, so lookups match what is on screen. */
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
  const [, requestRender] = useReducer((count: number) => count + 1, 0)
  const focusedRowRef = useRef<string | null>(null)
  const previousIdsRef = useRef<readonly string[]>(visibleIds)
  const focusRow = useCallback((id: string) => {
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-repo-row]') ?? []
    ;[...rows].find((row) => row.dataset.repoRowId === id)?.focus()
  }, [])
  const onListFocus = (event: FocusEvent) => {
    focusedRowRef.current = rowIdOf(event.target)
  }
  // Why deferred: a row removed mid-commit may fire focusout before the layout effect below can restore it.
  const onListBlur = (event: FocusEvent) => {
    const lostId = rowIdOf(event.target)
    const list = event.currentTarget
    queueMicrotask(() => {
      if (focusedRowRef.current === lostId && !list.contains(document.activeElement)) {
        focusedRowRef.current = null
      }
    })
  }
  // Why: a status refresh can move a row (Chromium blurs a moved node) or fold it away; keep focus in the list.
  useLayoutEffect(() => {
    const previousIds = previousIdsRef.current
    previousIdsRef.current = visibleIds
    const pendingId = pendingFocusRef.current
    if (pendingId !== null) {
      pendingFocusRef.current = null
      focusRow(visibleIds.includes(pendingId) ? pendingId : (rovingId ?? pendingId))
      return
    }
    const lostId = focusedRowRef.current
    // Why the order check: only a redraw of the rows can lose focus; any other render must not pull it back.
    const listChanged =
      previousIds.length !== visibleIds.length ||
      previousIds.some((id, index) => id !== visibleIds[index])
    if (lostId === null || !listChanged || !isFocusLost()) {
      return
    }
    const target = visibleIds.includes(lostId)
      ? lostId
      : nearestRemainingRow(previousIds, visibleIds, lostId)
    if (target !== undefined) {
      focusRow(target)
      return
    }
    listRef.current?.querySelector<HTMLElement>('[data-folder-repo-list] button')?.focus()
  })
  const focusRepo = (id: string) => {
    setFocusId(id)
    focusRow(id)
  }
  /** Call before a selection re-renders the list, so focus follows the row to its new place. */
  const keepFocusAfterToggle = (id: string) => {
    pendingFocusRef.current = id
    setFocusId(id)
    // Why: re-picking the open row changes no other state; an unconsumed request would steal focus on a later poll.
    requestRender()
  }
  return { listRef, rovingId, focusRepo, keepFocusAfterToggle, onListFocus, onListBlur }
}
