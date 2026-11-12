// Fork-only: one-line path that shortens in the middle to its measured width (copy dialog, restore preview).
import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/class-names'
import { shortenPathToWidth } from './clipcode-path-shortening'

/**
 * Fills the width its flex row gives it; the full path stays in the tooltip.
 * Its content width is always the full path's, so `flex-initial` lets it claim that width before its neighbours.
 */
export function ClipcodeMiddleEllipsisPath({
  path,
  title = path,
  className
}: {
  path: string
  title?: string
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
      // Why: the hidden ::after holds the full path, so the DOM itself says whether it fits.
      if (element.scrollWidth <= element.clientWidth) {
        setShown(path)
        return
      }
      // Why the computed font and spacing: the text is measured exactly as this element draws it.
      // Why longhands: the `font` shorthand is '' under tabular-nums, which leaves the canvas at 10px sans-serif.
      const style = getComputedStyle(element)
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      context.letterSpacing = style.letterSpacing
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
      title={title}
      data-full={path}
      className={cn(
        // Why the hidden ::after: a shortened text must not shrink the width the row grants it.
        'block min-w-0 flex-1 overflow-hidden whitespace-pre after:invisible after:block after:h-0 after:w-max after:content-[attr(data-full)]',
        className
      )}
    >
      {shown}
    </span>
  )
}
