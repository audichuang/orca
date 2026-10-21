// Fork-only: an explicit "focus the commit list" request for a Git Graph tab; repo follows never make one.
import { useSyncExternalStore } from 'react'

export type GitGraphFocusRequestEntry = {
  nonce: number
  /** Made from an open menu or dialog, whose close hands focus back to its trigger. */
  fromModal: boolean
}

const pendingByTab = new Map<string, GitGraphFocusRequestEntry>()
const listeners = new Set<() => void>()
let nextNonce = 0
const MODAL_ROLES = '[role="menu"],[role="dialog"],[role="alertdialog"]'

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** An explicit open (button, shortcut, palette, Show in Git Graph): focus moves to the graph. */
export function requestGitGraphFocus(tabId: string): void {
  nextNonce += 1
  const active = typeof document === 'undefined' ? null : document.activeElement
  pendingByTab.set(tabId, { nonce: nextNonce, fromModal: Boolean(active?.closest(MODAL_ROLES)) })
  notify()
}

/** Clears the request only if it is still the one handled, so a newer request survives. */
export function consumeGitGraphFocusRequest(tabId: string, nonce: number): void {
  if (pendingByTab.get(tabId)?.nonce === nonce) {
    pendingByTab.delete(tabId)
    notify()
  }
}

export function forgetGitGraphFocusRequest(tabId: string): void {
  if (pendingByTab.delete(tabId)) {
    notify()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGitGraphFocusRequest(
  tabId: string | undefined
): GitGraphFocusRequestEntry | null {
  const read = () => (tabId === undefined ? null : (pendingByTab.get(tabId) ?? null))
  return useSyncExternalStore(subscribe, read, read)
}

// Why: a closing menu or dialog (Radix) hands focus back to its trigger in a timeout after its exit
// animation, which would undo the move; ~1s covers that, and any user input ends the hold sooner.
const HOLD_MS = 1000

/** Keeps focus on `row` if a closing menu or dialog outside `root` takes it back before the user acts. */
export function holdGitGraphFocus(row: HTMLElement, root: Element): () => void {
  const stop = (): void => {
    window.clearTimeout(timer)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('pointerdown', stop, true)
    document.removeEventListener('keydown', stop, true)
  }
  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target
    // Why skip menus and dialogs: while still open, a modal one traps focus inside itself.
    if (!(target instanceof Element) || root.contains(target) || target.closest(MODAL_ROLES)) {
      return
    }
    stop()
    if (row.isConnected) {
      row.focus({ preventScroll: true })
    }
  }
  const timer = window.setTimeout(stop, HOLD_MS)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('pointerdown', stop, true)
  document.addEventListener('keydown', stop, true)
  return stop
}
