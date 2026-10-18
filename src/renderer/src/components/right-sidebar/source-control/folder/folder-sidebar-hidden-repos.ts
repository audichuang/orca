import { useSyncExternalStore } from 'react'
import { normalizeRuntimePathForComparison } from '../../../../../../shared/cross-platform-path'
import {
  getRepoExecutionHostId,
  getRepoSshConnectionId
} from '../../../../../../shared/execution-host'
import { isGitRepoKind } from '../../../../../../shared/repo-kind'
import type { Repo } from '../../../../../../shared/repo-types'

// Why its own module with no store import: the sidebar's visible-worktree filter runs inside the
// store's attention slice, so importing the store here would close an import cycle.

const STORAGE_KEY = 'orca.fork.folderSidebarHiddenRepos'

type RepoOwnerFields = Pick<Repo, 'path' | 'connectionId' | 'executionHostId'>

// Why path, not repo id: removing and re-adding a repo mints a new id but should keep the choice.
export function folderSidebarHiddenRepoKey(repo: RepoOwnerFields): string {
  const owner = `${getRepoExecutionHostId(repo)}|${getRepoSshConnectionId(repo) ?? ''}`
  return `${owner}\n${normalizeRuntimePathForComparison(repo.path)}`
}

function readStoredKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(
      Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []
    )
  } catch {
    return new Set()
  }
}

let hiddenKeys: Set<string> | null = null
let version = 0
const listeners = new Set<() => void>()

function getHiddenKeys(): Set<string> {
  hiddenKeys ??= readStoredKeys()
  return hiddenKeys
}

export function isRepoHiddenFromSidebar(repo: RepoOwnerFields): boolean {
  return getHiddenKeys().has(folderSidebarHiddenRepoKey(repo))
}

export function setReposHiddenFromSidebar(repos: readonly RepoOwnerFields[], hidden: boolean) {
  const keys = new Set(getHiddenKeys())
  for (const repo of repos) {
    const key = folderSidebarHiddenRepoKey(repo)
    if (hidden) {
      keys.add(key)
    } else {
      keys.delete(key)
    }
  }
  hiddenKeys = keys
  version++
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // Storage can be unavailable; the choice still holds for this session.
  }
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeFolderSidebarHiddenRepos(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getFolderSidebarHiddenReposVersion(): number {
  return version
}

/** Bumps on every change, so memoized sidebar filters can key on it. */
export function useFolderSidebarHiddenReposVersion(): number {
  return useSyncExternalStore(subscribeFolderSidebarHiddenRepos, getFolderSidebarHiddenReposVersion)
}

/** Git repos the user chose to keep out of the sidebar; they stay listed in their folder's Source Control. */
export function getSidebarHiddenRepoIds(repos: Iterable<Repo>): ReadonlySet<string> {
  const keys = getHiddenKeys()
  const ids = new Set<string>()
  if (keys.size === 0) {
    return ids
  }
  for (const repo of repos) {
    if (isGitRepoKind(repo) && keys.has(folderSidebarHiddenRepoKey(repo))) {
      ids.add(repo.id)
    }
  }
  return ids
}

export function resetFolderSidebarHiddenReposForTest(): void {
  hiddenKeys = null
  version = 0
  listeners.clear()
}
