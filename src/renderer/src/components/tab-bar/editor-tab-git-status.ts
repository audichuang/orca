import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { joinPath, normalizeRelativePath } from '@/lib/path'
import { getIndexedWorktreeById } from '@/store/worktree-repo-index'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import type { GitFileStatus, GitStatusEntry } from '../../../../shared/git-status-types'
import { buildStatusMap } from '../right-sidebar/status-display'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'

type EditorTabStatusSource = Pick<OpenFile, 'relativePath'> &
  Partial<Pick<OpenFile, 'worktreeId' | 'gitWorktreeId' | 'filePath'>>

function scopedKey(gitWorktreeId: string, normalizedPath: string): string {
  return `${gitWorktreeId}\u0000${normalizedPath}`
}

/** Folder-workspace tabs read status from their repo, keyed apart so two repos' `README.md` never collide. */
export function getEditorTabGitStatusKey(file: EditorTabStatusSource): string {
  if (file.gitWorktreeId && file.gitWorktreeId !== file.worktreeId) {
    // Why: keyed by absolute path, since relativePath may not be relative to the repo.
    return scopedKey(file.gitWorktreeId, normalizeRuntimePathForComparison(file.filePath ?? ''))
  }
  return normalizeRelativePath(file.relativePath)
}

export function buildEditorTabGitStatusMap(
  ownEntries: readonly GitStatusEntry[],
  entriesByGitOwner: Readonly<Record<string, readonly GitStatusEntry[]>>,
  rootByGitOwner: Readonly<Record<string, string>>
): Map<string, GitFileStatus> {
  const map = buildStatusMap(ownEntries)
  for (const [gitWorktreeId, entries] of Object.entries(entriesByGitOwner)) {
    const root = rootByGitOwner[gitWorktreeId]
    if (!root) {
      continue
    }
    for (const [path, status] of buildStatusMap(entries)) {
      map.set(
        scopedKey(gitWorktreeId, normalizeRuntimePathForComparison(joinPath(root, path))),
        status
      )
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

/** Root of each repo backing a workspace's tabs; pair with `useShallow` so the strip ignores unrelated worktree writes. */
export function selectEditorTabGitOwnerRoots(
  state: Pick<AppState, 'openFiles' | 'worktreesByRepo'>,
  worktreeId: string
): Record<string, string> {
  const result: Record<string, string> = {}
  const worktreesByRepo = selectWorktreesByRepo(state)
  if (!state.openFiles || !worktreesByRepo) {
    return result
  }
  for (const id of getGitOwnerIds(state.openFiles, worktreeId)) {
    const root = getIndexedWorktreeById(worktreesByRepo, id)?.path
    if (root) {
      result[id] = root
    }
  }
  return result
}
