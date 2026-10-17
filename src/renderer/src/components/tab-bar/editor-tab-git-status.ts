import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { normalizeRelativePath } from '@/lib/path'
import type { GitFileStatus, GitStatusEntry } from '../../../../shared/git-status-types'
import { buildStatusMap } from '../right-sidebar/status-display'

type EditorTabStatusSource = Pick<OpenFile, 'relativePath'> &
  Partial<Pick<OpenFile, 'worktreeId' | 'gitWorktreeId'>>

function scopedKey(gitWorktreeId: string, normalizedPath: string): string {
  return `${gitWorktreeId}\u0000${normalizedPath}`
}

/** Folder-workspace tabs read status from their repo, keyed apart so two repos' `README.md` never collide. */
export function getEditorTabGitStatusKey(file: EditorTabStatusSource): string {
  const path = normalizeRelativePath(file.relativePath)
  return file.gitWorktreeId && file.gitWorktreeId !== file.worktreeId
    ? scopedKey(file.gitWorktreeId, path)
    : path
}

export function buildEditorTabGitStatusMap(
  ownEntries: readonly GitStatusEntry[],
  entriesByGitOwner: Readonly<Record<string, readonly GitStatusEntry[]>>
): Map<string, GitFileStatus> {
  const map = buildStatusMap(ownEntries)
  for (const [gitWorktreeId, entries] of Object.entries(entriesByGitOwner)) {
    for (const [path, status] of buildStatusMap(entries)) {
      map.set(scopedKey(gitWorktreeId, path), status)
    }
  }
  return map
}

let cachedOpenFiles: OpenFile[] | null = null
const cachedOwnerIdsByWorktree = new Map<string, string[]>()

function getGitOwnerIds(openFiles: OpenFile[], worktreeId: string): string[] {
  if (cachedOpenFiles !== openFiles) {
    cachedOpenFiles = openFiles
    cachedOwnerIdsByWorktree.clear()
  }
  let ids = cachedOwnerIdsByWorktree.get(worktreeId)
  if (!ids) {
    const unique = new Set<string>()
    for (const file of openFiles) {
      if (
        file.worktreeId === worktreeId &&
        file.gitWorktreeId &&
        file.gitWorktreeId !== worktreeId
      ) {
        unique.add(file.gitWorktreeId)
      }
    }
    ids = [...unique]
    cachedOwnerIdsByWorktree.set(worktreeId, ids)
  }
  return ids
}

/** Status lists of the repos backing a workspace's tabs; pair with `useShallow` so unchanged lists keep the result stable. */
export function selectEditorTabGitStatusByOwner(
  state: Pick<AppState, 'openFiles' | 'gitStatusByWorktree'>,
  worktreeId: string
): Record<string, GitStatusEntry[]> {
  const result: Record<string, GitStatusEntry[]> = {}
  if (!state.openFiles) {
    return result
  }
  for (const id of getGitOwnerIds(state.openFiles, worktreeId)) {
    const entries = state.gitStatusByWorktree?.[id]
    if (entries) {
      result[id] = entries
    }
  }
  return result
}
