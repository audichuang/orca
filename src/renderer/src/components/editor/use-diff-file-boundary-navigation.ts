import { useCallback, useEffect, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'
import {
  hasDiffChangeInDirection,
  revealArrivalChange,
  type DiffDirection
} from './diff-change-boundary'
import type { DiffFilePosition } from './diff-file-sequence'

const ARMED_HINT_MS = 3000

type DiffFileBoundaryNavigation = {
  /** Direction whose next press leaves the file; drives the "press again" hint. */
  armedDirection: DiffDirection | null
  /** `diffEditor` is null for diffs Monaco does not render (images, binaries, previews). */
  navigate: (diffEditor: editor.IStandaloneDiffEditor | null, direction: DiffDirection) => void
  onDiffUpdated: (diffEditor: editor.IStandaloneDiffEditor) => void
  hasFileArrival: () => boolean
}

/**
 * IntelliJ-style change navigation across a diff's file list: at the last (or
 * first) change one press arms a hint, the next press opens the neighbouring file.
 */
export function useDiffFileBoundaryNavigation(
  filePosition: DiffFilePosition | null
): DiffFileBoundaryNavigation {
  const positionRef = useRef(filePosition)
  positionRef.current = filePosition
  const armedRef = useRef<{ direction: DiffDirection; line: number | undefined } | null>(null)
  const disarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [armedDirection, setArmedDirection] = useState<DiffDirection | null>(null)
  const arrivalRef = useRef<{
    direction: DiffDirection
    key: string
    scheduled: boolean
  } | null>(null)

  const arm = useCallback(
    (armed: { direction: DiffDirection; line: number | undefined } | null) => {
      armedRef.current = armed
      setArmedDirection(armed?.direction ?? null)
      if (disarmTimerRef.current !== null) {
        clearTimeout(disarmTimerRef.current)
        disarmTimerRef.current = null
      }
      if (armed) {
        // Why: like IntelliJ's balloon, the second press only counts while the hint is fresh.
        disarmTimerRef.current = setTimeout(() => {
          armedRef.current = null
          disarmTimerRef.current = null
          setArmedDirection(null)
        }, ARMED_HINT_MS)
      }
    },
    []
  )

  useEffect(
    () => () => {
      if (disarmTimerRef.current !== null) {
        clearTimeout(disarmTimerRef.current)
      }
    },
    []
  )

  const filePositionKey = filePosition?.key
  useEffect(() => {
    arm(null)
    // Landing anywhere but the requested file drops the arrival, so it cannot fire on a later diff.
    if (arrivalRef.current && arrivalRef.current.key !== filePositionKey) {
      arrivalRef.current = null
    }
  }, [arm, filePositionKey])

  const navigate = useCallback(
    (diffEditor: editor.IStandaloneDiffEditor | null, direction: DiffDirection) => {
      const position = positionRef.current
      const target = position ? position.index + (direction === 'next' ? 1 : -1) : -1
      if (
        !position ||
        target < 0 ||
        target >= position.total ||
        (diffEditor && hasDiffChangeInDirection(diffEditor, direction))
      ) {
        arm(null)
        diffEditor?.goToDiff(direction)
        return
      }
      const line = diffEditor?.getModifiedEditor().getPosition()?.lineNumber
      const armed = armedRef.current
      // Moving the cursor after the hint means the user stayed in this file; re-arm instead.
      if (armed?.direction !== direction || armed.line !== line) {
        arm({ direction, line })
        return
      }
      arm(null)
      const targetKey = position.keyAt(target)
      arrivalRef.current = targetKey ? { direction, key: targetKey, scheduled: false } : null
      position.open(target)
    },
    [arm]
  )

  const onDiffUpdated = useCallback((diffEditor: editor.IStandaloneDiffEditor) => {
    const arrival = arrivalRef.current
    if (
      !arrival ||
      arrival.scheduled ||
      positionRef.current?.key !== arrival.key ||
      !diffEditor.getLineChanges()?.length
    ) {
      return
    }
    // Keep the key until leaving the file so late first-change initialization still yields.
    arrival.scheduled = true
    // Why two frames: view-state restore waits one; first-change auto-scroll yields to this arrival.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => revealArrivalChange(diffEditor, arrival.direction))
    )
  }, [])

  const hasFileArrival = useCallback(
    () => !!arrivalRef.current && arrivalRef.current.key === positionRef.current?.key,
    []
  )

  return { armedDirection, navigate, onDiffUpdated, hasFileArrival }
}
