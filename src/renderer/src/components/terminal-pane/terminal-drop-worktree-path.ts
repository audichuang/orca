import { useAppStore } from '@/store'
import { isTerminalDropWindowsPathLike } from './terminal-drop-shell'

export function resolveTerminalDropWorktreePath(
  worktreeId: string,
  fallbackCwd: string | undefined
): string | null {
  const state = useAppStore.getState()
  const allWorktrees = Object.values(state.worktreesByRepo ?? {}).flat()
  const worktree = allWorktrees.find((w) => w.id === worktreeId)
  return worktree?.path ?? fallbackCwd ?? null
}

export function joinRuntimeTerminalDropDir(worktreePath: string): string {
  if (isTerminalDropWindowsPathLike(worktreePath)) {
    return `${worktreePath.replace(/[\\/]+$/, '').replace(/\//g, '\\')}\\.orca\\drops`
  }
  return `${worktreePath.replace(/[\\/]+$/, '')}/.orca/drops`
}

// Why: clipboard-image paste lands beside terminal file drops under the
// gitignored .orca/ dir; mirror joinRuntimeTerminalDropDir's separator handling.
export function joinRuntimePasteImagesDir(worktreePath: string): string {
  if (isTerminalDropWindowsPathLike(worktreePath)) {
    return `${worktreePath.replace(/[\\/]+$/, '').replace(/\//g, '\\')}\\.orca\\paste-images`
  }
  return `${worktreePath.replace(/[\\/]+$/, '')}/.orca/paste-images`
}
