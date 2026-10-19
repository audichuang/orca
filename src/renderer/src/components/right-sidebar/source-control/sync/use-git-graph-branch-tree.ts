// Fork-only: open/closed/overlay state of the full Git Graph's branch tree.
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitHistoryResult } from '../../../../../../shared/git-history'
import type { GitGraphSelectionState } from './use-git-graph-full-view-state'

// Why module scope: closing the tree is a layout choice for the session, not for one dialog.
let rememberedTreePreference: boolean | null = null
// Why: below this the branch tree would squeeze the commit list; it stays one click away.
const TREE_AUTO_OPEN_MIN_WIDTH = 1200
// Branch tree + details minimum + commit list minimum + margin; below it the tree overlays.
const TREE_DOCK_MIN_WIDTH = 1080

type PendingTipJump = {
  ref: string
  /** Only the first history that replaces this one may complete the jump. */
  fromResult: GitHistoryResult | undefined
  /** Any selection gesture since the request means the user moved on. */
  fromGeneration: number
}

export type GitGraphBranchTreeState = {
  open: boolean
  /** Too narrow to dock: the tree floats over the commit list. */
  overlay: boolean
  toggleRef: React.RefObject<HTMLButtonElement | null>
  toggle: () => void
  /** Closes the overlay and returns focus to its toggle; false when there was none to close. */
  dismissOverlay: () => boolean
  onJump: (commitId: string) => void
  onShowRef: (fullName: string) => void
}

export function useGitGraphBranchTree(args: {
  /** Width of the Git Graph view itself, not the window. */
  viewWidth: number
  result: GitHistoryResult | undefined
  getNavigationGeneration: GitGraphSelectionState['getNavigationGeneration']
  jumpTo: GitGraphSelectionState['jumpTo']
  /** Narrows the graph to one ref whose tip is not loaded. */
  showRef: (fullName: string) => void
}): GitGraphBranchTreeState {
  const { viewWidth, result, getNavigationGeneration, jumpTo, showRef } = args
  const [preference, setPreferenceState] = useState(rememberedTreePreference)
  const setPreference = useCallback((next: boolean): void => {
    rememberedTreePreference = next
    setPreferenceState(next)
  }, [])
  const open = preference ?? viewWidth >= TREE_AUTO_OPEN_MIN_WIDTH
  const overlay = open && viewWidth < TREE_DOCK_MIN_WIDTH
  const toggleRef = useRef<HTMLButtonElement>(null)

  const dismissOverlay = useCallback((): boolean => {
    if (!overlay) {
      return false
    }
    toggleRef.current?.focus()
    setPreference(false)
    return true
  }, [overlay, setPreference])

  // Why pending: an unloaded branch first reloads the graph; select its tip once it arrives,
  // unless the user navigated elsewhere meanwhile.
  const pendingRef = useRef<PendingTipJump | null>(null)
  useEffect(() => {
    const pending = pendingRef.current
    if (!pending || result === pending.fromResult) {
      return
    }
    pendingRef.current = null
    if (getNavigationGeneration() !== pending.fromGeneration) {
      return
    }
    const tip = result?.items.find((item) => item.references?.some((ref) => ref.id === pending.ref))
    if (tip) {
      jumpTo(tip.id, { focus: true })
    }
  }, [getNavigationGeneration, jumpTo, result])

  return {
    open,
    overlay,
    toggleRef,
    toggle: () => setPreference(!open),
    dismissOverlay,
    onJump: (commitId) => {
      pendingRef.current = null
      // Why focus: closing the overlay removes the focused tree button with it.
      jumpTo(commitId, { focus: overlay })
      if (overlay) {
        setPreference(false)
      }
    },
    onShowRef: (fullName) => {
      pendingRef.current = {
        ref: fullName,
        fromResult: result,
        fromGeneration: getNavigationGeneration()
      }
      showRef(fullName)
      dismissOverlay()
    }
  }
}

/** Test seam: the tree preference outlives a dialog, so tests reset it between cases. */
export function resetGitGraphBranchTreePreferenceForTest(): void {
  rememberedTreePreference = null
}
