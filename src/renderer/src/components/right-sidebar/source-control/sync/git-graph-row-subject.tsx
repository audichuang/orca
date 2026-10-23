// Fork-only: a full Git Graph row's subject; the cursor row floats its whole text over nearby rows.
import React, { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type OverlayLayout = { clipped: boolean; upward: boolean }

/**
 * Always one truncated line, so rows never change height. When `expanded` and the line is cut
 * off, a layer over the neighbouring rows shows all of it; it ignores the pointer so those rows
 * stay clickable. Needs a positioned parent (the message cell) inside the scrolling list.
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
  const overlayRef = useRef<HTMLSpanElement>(null)
  const [layout, setLayout] = useState<OverlayLayout>({ clipped: false, upward: false })
  useLayoutEffect(() => {
    const line = lineRef.current
    if (!expanded || !line) {
      return
    }
    const measure = (): void => {
      const clipped = line.scrollWidth > line.clientWidth + 1
      const overlay = overlayRef.current
      const cell = line.parentElement
      const list = line.closest('[data-git-graph-list]')
      let upward = false
      if (clipped && overlay && cell && list) {
        // Why it must fit the visible list: a layer past it would grow the scroll area, and the
        // rows would jump back once it closes.
        const needed = overlay.getBoundingClientRect().height
        const cellBox = cell.getBoundingClientRect()
        const listBox = list.getBoundingClientRect()
        const below = listBox.bottom - cellBox.top
        const above = cellBox.bottom - listBox.top
        upward = needed > below && above > below
      }
      setLayout((current) =>
        current.clipped === clipped && current.upward === upward ? current : { clipped, upward }
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    // Why observe: a resized list or details pane can cut the line off, or let it fit, later.
    const observer = new ResizeObserver(measure)
    observer.observe(line)
    return () => observer.disconnect()
  }, [expanded, text, layout.clipped])
  return (
    <>
      <span ref={lineRef} className={cn('min-w-0 truncate leading-4', className)} title={text}>
        {text}
      </span>
      {expanded && layout.clipped && (
        <span
          ref={overlayRef}
          data-subject-overlay={layout.upward ? 'up' : 'down'}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute -inset-x-1.5 z-10 rounded-md border border-border bg-popover px-1.5 py-1.5 leading-4 break-words whitespace-normal text-popover-foreground shadow-md',
            layout.upward ? 'bottom-0' : 'top-0'
          )}
        >
          {text}
        </span>
      )}
    </>
  )
}
