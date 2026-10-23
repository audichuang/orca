// Fork-only: a full Git Graph row's subject; the cursor row floats its whole text over the rows below.
import React, { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Always one truncated line, so rows never change height. When `expanded` and the line is cut
 * off, a layer over the rows below shows all of it; it ignores the pointer so those rows stay
 * clickable. Needs a positioned parent (the message cell).
 */
export function GitGraphRowSubject({
  text,
  expanded,
  className
}: {
  text: string
  expanded: boolean
  className?: string
}): React.JSX.Element {
  const lineRef = useRef<HTMLSpanElement>(null)
  const [clipped, setClipped] = useState(false)
  useLayoutEffect(() => {
    const line = lineRef.current
    if (!expanded || !line) {
      return
    }
    const measure = (): void => setClipped(line.scrollWidth > line.clientWidth + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    // Why observe: a resized list or details pane can cut the line off, or let it fit, later.
    const observer = new ResizeObserver(measure)
    observer.observe(line)
    return () => observer.disconnect()
  }, [expanded, text])
  return (
    <>
      <span ref={lineRef} className={cn('min-w-0 truncate leading-4', className)} title={text}>
        {text}
      </span>
      {expanded && clipped && (
        <span
          data-subject-overlay=""
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-1.5 top-0 z-10 rounded-md border border-border bg-popover px-1.5 py-1.5 leading-4 break-words whitespace-normal text-popover-foreground shadow-md"
        >
          {text}
        </span>
      )}
    </>
  )
}
