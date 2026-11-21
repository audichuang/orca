// Fork-only: the Git Graph list's display choices (which columns show, one or two lines per row).
import { useSyncExternalStore } from 'react'
import { z } from 'zod'

export type GitGraphListPrefs = {
  author: boolean
  date: boolean
  hash: boolean
  /** Message on the first line, author/date/refs on a muted second line. */
  twoLine: boolean
}

// Why hash off: the details pane and the row menu's "Copy commit hash" already carry it.
export const DEFAULT_GIT_GRAPH_LIST_PREFS: GitGraphListPrefs = {
  author: true,
  date: true,
  hash: false,
  twoLine: false
}

const STORAGE_KEY = 'orca:git-graph-list'

// Why per-field catch: a key added later must not reset the choices already stored.
const StoredPrefsSchema = z.object({
  author: z.boolean().catch(DEFAULT_GIT_GRAPH_LIST_PREFS.author),
  date: z.boolean().catch(DEFAULT_GIT_GRAPH_LIST_PREFS.date),
  hash: z.boolean().catch(DEFAULT_GIT_GRAPH_LIST_PREFS.hash),
  twoLine: z.boolean().catch(DEFAULT_GIT_GRAPH_LIST_PREFS.twoLine)
})

function readStored(): GitGraphListPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? StoredPrefsSchema.safeParse(JSON.parse(raw)) : null
    return parsed?.success ? parsed.data : DEFAULT_GIT_GRAPH_LIST_PREFS
  } catch {
    return DEFAULT_GIT_GRAPH_LIST_PREFS
  }
}

let current: GitGraphListPrefs | null = null
const listeners = new Set<() => void>()

function snapshot(): GitGraphListPrefs {
  current ??= readStored()
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setGitGraphListPrefs(patch: Partial<GitGraphListPrefs>): void {
  current = { ...snapshot(), ...patch }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {}
  for (const listener of listeners) {
    listener()
  }
}

export function resetGitGraphListPrefs(): void {
  current = DEFAULT_GIT_GRAPH_LIST_PREFS
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {}
  for (const listener of listeners) {
    listener()
  }
}

/** Shared by every open Git Graph, so a change in one tab shows in the others. */
export function useGitGraphListPrefs(): GitGraphListPrefs {
  return useSyncExternalStore(subscribe, snapshot)
}
