// Fork-only: a one-shot "select this commit" request for a Git Graph tab; never persisted with the tab.
import { useSyncExternalStore } from 'react'

export type GitGraphRevealRequest = {
  repoWorktreeId: string
  commitId: string
  /** Distinguishes a repeat reveal of the same commit from the one already handled. */
  nonce: number
  /** Judge only history read after this request, e.g. once a filter change has reloaded it. */
  afterReload?: boolean
}

const requestsByTab = new Map<string, GitGraphRevealRequest>()
const listeners = new Set<() => void>()
let nextNonce = 0

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function requestGitGraphReveal(
  tabId: string,
  repoWorktreeId: string,
  commitId: string,
  opts?: { afterReload?: boolean }
): void {
  nextNonce += 1
  requestsByTab.set(tabId, {
    repoWorktreeId,
    commitId,
    nonce: nextNonce,
    ...(opts?.afterReload ? { afterReload: true } : {})
  })
  notify()
}

export function peekGitGraphRevealRequest(tabId: string): GitGraphRevealRequest | null {
  return requestsByTab.get(tabId) ?? null
}

/** Clears the request only if it is still the one handled, so a newer reveal survives. */
export function consumeGitGraphRevealRequest(tabId: string, nonce: number): void {
  if (requestsByTab.get(tabId)?.nonce === nonce) {
    requestsByTab.delete(tabId)
    notify()
  }
}

/** A tab switched to `repoWorktreeId`; a reveal made for another repo would otherwise wait forever. */
export function dropGitGraphRevealRequestUnlessRepo(tabId: string, repoWorktreeId: string): void {
  const request = requestsByTab.get(tabId)
  if (request && request.repoWorktreeId !== repoWorktreeId) {
    requestsByTab.delete(tabId)
    notify()
  }
}

export function forgetGitGraphRevealRequest(tabId: string): void {
  if (requestsByTab.delete(tabId)) {
    notify()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGitGraphRevealRequest(tabId: string): GitGraphRevealRequest | null {
  const read = () => peekGitGraphRevealRequest(tabId)
  return useSyncExternalStore(subscribe, read, read)
}
