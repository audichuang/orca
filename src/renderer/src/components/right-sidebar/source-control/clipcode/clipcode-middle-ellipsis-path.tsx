// Fork-only: one-line path that shortens in the middle to its measured width (copy dialog, restore preview).
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { shortenPathToWidth } from './clipcode-path-shortening'

/** Fills the width its flex row gives it; the full path stays in the tooltip. */
export function ClipcodeMiddleEllipsisPath({
  path,
  className
}: {
  path: string
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(path)
  useLayoutEffect(() => {
    const element = ref.current
    // Why: without layout (tests, no ResizeObserver) the full path is shown and CSS clips it.
    const context =
      element && typeof ResizeObserver !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : null
    if (!element || !context) {
      setShown(path)
      return
    }
    const update = (): void => {
      // Why the computed font: the text is measured exactly as this element draws it.
      context.font = getComputedStyle(element).font
      setShown(
        shortenPathToWidth(
          path,
          // Why offsetWidth: the layout width, unscaled by the dialog's zoom-in transform.
          // Why 1px less: canvas and DOM text widths can differ by a fraction, which would clip a letter.
          Math.max(0, element.offsetWidth - 1),
          (text) => context.measureText(text).width
        )
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [path])
  return (
    <span
      ref={ref}
      title={path}
      className={cn('block min-w-0 flex-1 overflow-hidden whitespace-pre', className)}
    >
      {shown}
    </span>
  )
}
