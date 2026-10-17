import { useState, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import type { GitStatusEntry } from '../../../../../../shared/git-status-types'
import type { SourceControlRowOpenEvent } from './split-open'

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
}

export type FlatEntry = {
  key: string
  entry: GitStatusEntry
  area: 'unstaged' | 'staged' | 'untracked'
}

export function reconcileSourceControlSelectionState(args: {
  selectedKeys: ReadonlySet<string>
  anchorKey: string | null
  flatEntries: FlatEntry[]
}): { selectedKeys: ReadonlySet<string>; anchorKey: string | null } {
  const { anchorKey, flatEntries, selectedKeys } = args
  // Nothing to prune and no anchor to invalidate: skip building the key set over every visible row.
  if (selectedKeys.size === 0 && anchorKey === null) {
    return { selectedKeys, anchorKey }
  }
  const validKeys = new Set(flatEntries.map((e) => e.key))
  const nextSelected = new Set<string>()
  let selectedChanged = false

  for (const key of selectedKeys) {
    if (validKeys.has(key)) {
      nextSelected.add(key)
    } else {
      selectedChanged = true
    }
  }

  return {
    selectedKeys: selectedChanged ? nextSelected : selectedKeys,
    anchorKey: anchorKey && !validKeys.has(anchorKey) ? null : anchorKey
  }
}

export function getSelectionRangeKeys(
  flatEntries: FlatEntry[],
  anchorKey: string | null,
  currentKey: string
): Set<string> | null {
  const anchorIndex = flatEntries.findIndex((e) => e.key === anchorKey)
  const currentIndex = flatEntries.findIndex((e) => e.key === currentKey)
  if (anchorIndex === -1 || currentIndex === -1) {
    return null
  }

  const start = Math.min(anchorIndex, currentIndex)
  const end = Math.max(anchorIndex, currentIndex)
  const nextSelected = new Set<string>()
  for (let i = start; i <= end; i++) {
    nextSelected.add(flatEntries[i].key)
  }
  return nextSelected
}

export function useSourceControlSelection({
  flatEntries,
  onOpenDiff,
  shouldOpenAsSplit,
  containerRef
}: {
  flatEntries: FlatEntry[]
  onOpenDiff: (entry: GitStatusEntry, event?: SourceControlRowOpenEvent) => void
  shouldOpenAsSplit?: (event: SourceControlRowOpenEvent) => boolean
  containerRef: RefObject<HTMLElement | null>
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [anchorKey, setAnchorKey] = useState<string | null>(null)
  const flatEntriesRef = useRef(flatEntries)
  const anchorKeyRef = useRef<string | null>(anchorKey)
  const selectedKeysRef = useRef(selectedKeys)
  const onOpenDiffRef = useRef(onOpenDiff)
  const shouldOpenAsSplitRef = useRef(shouldOpenAsSplit)

  useEffect(() => {
    flatEntriesRef.current = flatEntries
  }, [flatEntries])

  useEffect(() => {
    anchorKeyRef.current = anchorKey
  }, [anchorKey])

  useEffect(() => {
    selectedKeysRef.current = selectedKeys
  }, [selectedKeys])

  useEffect(() => {
    onOpenDiffRef.current = onOpenDiff
  }, [onOpenDiff])

  useEffect(() => {
    shouldOpenAsSplitRef.current = shouldOpenAsSplit
  }, [shouldOpenAsSplit])

  // Memoized: this hook re-runs on every Source Control panel render (commit-message keystrokes,
  // status polls), but the reconciliation only moves when one of these three references does.
  const reconciledSelection = useMemo(
    () => reconcileSourceControlSelectionState({ selectedKeys, anchorKey, flatEntries }),
    [selectedKeys, anchorKey, flatEntries]
  )
  if (reconciledSelection.selectedKeys !== selectedKeys) {
    // Why: visible source-control rows can disappear after filtering, staging,
    // or status refresh; prune stale bulk-action keys before children see them.
    setSelectedKeys(new Set(reconciledSelection.selectedKeys))
  }
  if (reconciledSelection.anchorKey !== anchorKey) {
    setAnchorKey(reconciledSelection.anchorKey)
  }

  // Why: only the row of the most recent plain click joins a following Cmd+click; the anchor alone is not consent.
  const plainClickedKeyRef = useRef<string | null>(null)

  const handleSelect = useCallback((e: React.MouseEvent, key: string, entry: GitStatusEntry) => {
    const plainClickedKey = plainClickedKeyRef.current
    plainClickedKeyRef.current = null
    if (shouldOpenAsSplitRef.current?.(e)) {
      setSelectedKeys((prev) => (prev.size > 0 ? new Set() : prev))
      setAnchorKey(null)
      onOpenDiffRef.current(entry, e)
      return
    }

    const isShift = e.shiftKey
    const isCmdOrCtrl = isMacPlatform() ? e.metaKey : e.ctrlKey

    if (isShift) {
      const nextSelected = getSelectionRangeKeys(flatEntriesRef.current, anchorKeyRef.current, key)
      if (nextSelected) {
        setSelectedKeys(nextSelected)
        return
      }

      // Why: when the anchor row disappears from the visible list because a
      // section collapsed or status changed, the next Shift-click should
      // fall back to the single-click behavior instead of selecting from a
      // stale invisible anchor.
      setSelectedKeys(new Set())
      setAnchorKey(key)
      onOpenDiffRef.current(entry)
    } else if (isCmdOrCtrl) {
      if (selectedKeysRef.current.has(key)) {
        setSelectedKeys((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      } else {
        // Why: a plain click marks the anchor without selecting; fold that row in so click A, Cmd+click B selects both.
        const foldedKey = selectedKeysRef.current.size === 0 ? plainClickedKey : null
        setSelectedKeys((prev) => {
          const next = new Set(prev)
          if (foldedKey && flatEntriesRef.current.some((e) => e.key === foldedKey)) {
            next.add(foldedKey)
          }
          next.add(key)
          return next
        })
        setAnchorKey(key)
      }
    } else {
      // Plain click
      setSelectedKeys((prev) => {
        if (prev.size > 0) {
          return new Set()
        }
        return prev
      })
      setAnchorKey(key)
      plainClickedKeyRef.current = key
      onOpenDiffRef.current(entry)
    }
  }, [])

  const handleContextMenu = useCallback((key: string) => {
    plainClickedKeyRef.current = null
    if (!selectedKeysRef.current.has(key)) {
      setSelectedKeys(new Set([key]))
      setAnchorKey(key)
    }
  }, [])

  const clearSelection = useCallback(() => {
    plainClickedKeyRef.current = null
    setSelectedKeys(new Set())
    setAnchorKey(null)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Why: Escape inside an open menu only dismisses the menu, not the selection it acts on.
      if (e.target instanceof Element && e.target.closest('[role="menu"]')) {
        return
      }
      if (e.key === 'Escape' && selectedKeys.size > 0) {
        e.preventDefault()
        clearSelection()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedKeys.size, clearSelection])

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (selectedKeys.size === 0) {
        return
      }

      const container = containerRef.current
      const target = e.target
      if (!container || !(target instanceof Node) || container.contains(target)) {
        return
      }
      // Why: portaled Radix menus live outside the list; clearing here would drop the selection before the action runs.
      if (target instanceof Element && target.closest('[role="menu"]')) {
        return
      }

      clearSelection()
    }

    // Why: use capture so outside clicks clear the selection before the next
    // UI surface handles the pointer event, matching standard desktop list UX.
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [selectedKeys.size, containerRef, clearSelection])

  return {
    selectedKeys,
    handleSelect,
    handleContextMenu,
    clearSelection
  }
}
