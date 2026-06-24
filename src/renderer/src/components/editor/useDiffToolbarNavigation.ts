import { useCallback, useRef } from 'react'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { resolveAdjacentChangedDiff } from './diff-change-navigation'

export type DiffToolbarNavigation = {
  onRegisterDiffNavigation: (
    goToChange: ((direction: 'next' | 'previous') => boolean) | null
  ) => void
  onDiffPrevChange: () => void
  onDiffNextChange: () => void
}

// Why: drives the single-file diff toolbar's prev/next from the header (a sibling
// of the diff editor). The active DiffViewer registers a boundary-aware nav fn;
// at a file boundary we fall through to the adjacent changed file. Store reads go
// through getState() so the panel doesn't re-render on unrelated status churn.
export function useDiffToolbarNavigation(
  activeFile: OpenFile | null,
  activeViewStateId: string | null | undefined
): DiffToolbarNavigation {
  const diffNavRef = useRef<((direction: 'next' | 'previous') => boolean) | null>(null)
  const onRegisterDiffNavigation = useCallback(
    (goToChange: ((direction: 'next' | 'previous') => boolean) | null) => {
      diffNavRef.current = goToChange
    },
    []
  )

  const navigate = useCallback(
    (direction: 'next' | 'previous') => {
      if (diffNavRef.current?.(direction) || !activeFile) {
        return
      }
      const state = useAppStore.getState()
      const target = resolveAdjacentChangedDiff(
        activeFile,
        state.gitStatusByWorktree[activeFile.worktreeId] ?? [],
        state.worktreesByRepo,
        direction,
        state.settings?.sourceControlGroupOrder
      )
      if (!target) {
        return
      }
      // Land on the adjacent file's matching edge (next→first hunk, prev→last) so
      // prev/next keeps walking changes across the boundary; keep the jump in the
      // pane being navigated (openDiff otherwise targets the worktree active group).
      // Scope the edge to the target file so only its DiffViewer consumes it.
      state.setPendingDiffChangeEdge({
        edge: direction === 'next' ? 'first' : 'last',
        worktreeId: target.worktreeId,
        relativePath: target.relativePath
      })
      const tabs = state.unifiedTabsByWorktree[activeFile.worktreeId] ?? []
      const targetGroupId = activeViewStateId
        ? tabs.find((tab) => tab.id === activeViewStateId)?.groupId
        : undefined
      state.openDiff(
        target.worktreeId,
        target.filePath,
        target.relativePath,
        target.language,
        target.staged,
        { preview: true, targetGroupId, runtimeEnvironmentId: target.runtimeEnvironmentId }
      )
    },
    [activeFile, activeViewStateId]
  )

  const onDiffPrevChange = useCallback(() => navigate('previous'), [navigate])
  const onDiffNextChange = useCallback(() => navigate('next'), [navigate])
  return { onRegisterDiffNavigation, onDiffPrevChange, onDiffNextChange }
}
