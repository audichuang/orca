import type { editor } from 'monaco-editor'
import type { GitStagingArea, GitStatusEntry } from '../../../../shared/git-status-types'
import type { DiffSource, OpenFile } from '@/store/slices/editor'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { compareGitStatusEntries } from '../right-sidebar/source-control-status-sort'
import {
  resolveSourceControlGroupOrder,
  type SourceControlSectionArea
} from '../right-sidebar/source-control-section-order'
import type { SourceControlGroupOrder } from '../../../../shared/types'

export type DiffNavigationDirection = 'next' | 'previous'

// Why: pick the change line to jump to within one file's diff. Returns null at
// the boundary (no further change that way) so the caller can decide whether to
// cross into the adjacent file instead of wrapping.
export function findAdjacentChangeLine(
  changeLines: readonly number[],
  currentLine: number,
  direction: DiffNavigationDirection
): number | null {
  const sorted = [...changeLines].sort((a, b) => a - b)
  if (direction === 'next') {
    return sorted.find((line) => line > currentLine) ?? null
  }
  let previous: number | null = null
  for (const line of sorted) {
    if (line >= currentLine) {
      break
    }
    previous = line
  }
  return previous
}

// Why: a single-file diff belongs to one staging side. Unstaged and untracked
// entries are both "not staged", so prev/next walks them together — matching how
// Source Control groups the changed-file list the user opened from. Branch/commit/
// combined diffs aren't backed by the working-tree status list, so they get no
// adjacent file (within-file nav still works).
function areasForDiffSource(diffSource: DiffSource): GitStagingArea[] {
  if (diffSource === 'staged') {
    return ['staged']
  }
  if (diffSource === 'unstaged') {
    return ['unstaged', 'untracked']
  }
  return []
}

export function findAdjacentChangedFilePath(
  entries: readonly GitStatusEntry[],
  currentRelativePath: string,
  diffSource: DiffSource,
  direction: DiffNavigationDirection,
  groupOrder: readonly SourceControlSectionArea[]
): string | null {
  const relevant = new Set<GitStagingArea>(areasForDiffSource(diffSource))
  if (relevant.size === 0) {
    return null
  }
  // Why: match the order the user sees in Source Control — relevant groups in
  // the configured group order, each sorted by the same comparator. filter()
  // copies before sort() so the store's entries array is never mutated.
  const paths = groupOrder
    .filter((area) => relevant.has(area))
    .flatMap((area) =>
      entries
        .filter((entry) => entry.area === area)
        .sort(compareGitStatusEntries)
        .map((entry) => entry.path)
    )
  const index = paths.indexOf(currentRelativePath)
  if (index === -1) {
    return null
  }
  const targetIndex = direction === 'next' ? index + 1 : index - 1
  return paths[targetIndex] ?? null
}

// Why: move the cursor/viewport to the adjacent change inside the diff editor.
// Returns false when already at the boundary so the toolbar can fall through to
// switching files. Reads the live editor each call so it survives model swaps.
export function goToAdjacentChange(
  diffEditor: editor.IStandaloneDiffEditor | null,
  direction: DiffNavigationDirection
): boolean {
  if (!diffEditor) {
    return false
  }
  const changes = diffEditor.getLineChanges()
  if (!changes || changes.length === 0) {
    return false
  }
  const modifiedEditor = diffEditor.getModifiedEditor()
  const currentLine = modifiedEditor.getPosition()?.lineNumber ?? 1
  // modifiedStartLineNumber is 0 for pure deletions; clamp so it stays a valid line.
  const changeLines = changes.map((change) => Math.max(1, change.modifiedStartLineNumber))
  const target = findAdjacentChangeLine(changeLines, currentLine, direction)
  if (target == null) {
    return false
  }
  modifiedEditor.setPosition({ lineNumber: target, column: 1 })
  const top = modifiedEditor.getTopForLineNumber(target, true)
  const height = modifiedEditor.getLayoutInfo().height
  modifiedEditor.setScrollTop(Math.max(0, top - height / 2))
  return true
}

export type AdjacentChangedDiff = {
  worktreeId: string
  filePath: string
  relativePath: string
  language: string
  staged: boolean
  runtimeEnvironmentId?: string
}

// Why: resolve the openDiff arguments for the changed file adjacent to the active
// single-file diff, or null when there is none (boundary, non-working-tree diff,
// or missing worktree path). Keeps path/language plumbing out of the panel.
export function resolveAdjacentChangedDiff(
  activeFile: OpenFile,
  entries: readonly GitStatusEntry[],
  worktreesByRepo: Parameters<typeof findWorktreeById>[0],
  direction: DiffNavigationDirection,
  groupOrderSetting: SourceControlGroupOrder | null | undefined
): AdjacentChangedDiff | null {
  if (activeFile.mode !== 'diff' || !activeFile.diffSource) {
    return null
  }
  const nextRelativePath = findAdjacentChangedFilePath(
    entries,
    activeFile.relativePath,
    activeFile.diffSource,
    direction,
    resolveSourceControlGroupOrder(groupOrderSetting)
  )
  const worktreePath = findWorktreeById(worktreesByRepo, activeFile.worktreeId)?.path
  if (!nextRelativePath || !worktreePath) {
    return null
  }
  return {
    worktreeId: activeFile.worktreeId,
    filePath: joinPath(worktreePath, nextRelativePath),
    relativePath: nextRelativePath,
    language: detectLanguage(nextRelativePath),
    staged: activeFile.diffSource === 'staged',
    runtimeEnvironmentId: activeFile.runtimeEnvironmentId ?? undefined
  }
}
