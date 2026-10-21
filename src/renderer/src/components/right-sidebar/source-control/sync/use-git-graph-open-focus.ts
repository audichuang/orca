// Fork-only: lands focus on the full Git Graph's commit list once, when it opens.
import type React from 'react'
import { useEffect, useRef } from 'react'
import {
  holdGitGraphFocus,
  type GitGraphFocusRequestEntry
} from '../../../git-graph-tab/git-graph-focus-request'

/**
 * The first pass takes focus (opening the graph is the gesture), unless `claimOnOpen` is false: a
 * repo the tab followed from elsewhere lands focus only when it is parked or already in the graph.
 * Later passes, run when history arrives, only take focus still parked on the loading placeholder
 * or nowhere: a tab, unlike the old dialog, sits beside other panes the user may have moved to.
 */
export function useGitGraphOpenFocus(
  listRef: React.RefObject<HTMLDivElement | null>,
  cursorId: string | null | undefined,
  claimOnOpen = true
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
    if (!parked && (startedRef.current || !claimOnOpen || root?.contains(active))) {
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
  }, [claimOnOpen, cursorId, listRef])
}

export type GitGraphFocusRequest = {
  /** Pending explicit request, or null. */
  pending: GitGraphFocusRequestEntry | null
  onHandled: (nonce: number) => void
}

/**
 * An explicit open lands focus on the roving row even when the graph is already shown, once rows
 * exist and any reveal has moved the cursor; one made from a menu holds through its focus restore.
 */
export function useGitGraphRequestedFocus(
  listRef: React.RefObject<HTMLDivElement | null>,
  cursorId: string | null | undefined,
  request: GitGraphFocusRequest | undefined,
  opts: { revealPending: boolean; settled: boolean }
): void {
  const nonce = request?.pending?.nonce ?? null
  const fromModal = request?.pending?.fromModal ?? false
  const onHandled = request?.onHandled
  const { revealPending, settled } = opts
  useEffect(() => {
    const list = listRef.current
    if (nonce === null || !onHandled || revealPending || !list) {
      return
    }
    const target = list.querySelector<HTMLElement>('[tabindex="0"]') ?? (settled ? list : null)
    if (!target) {
      return
    }
    target.focus({ preventScroll: true })
    onHandled(nonce)
    const root = list.closest('[data-git-graph-root]')
    if (fromModal && root) {
      holdGitGraphFocus(target, root)
    }
  }, [cursorId, fromModal, listRef, nonce, onHandled, revealPending, settled])
}
