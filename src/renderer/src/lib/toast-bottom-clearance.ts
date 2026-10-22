// Fork-only: bottom-docked chrome that bottom-right toasts must not cover.

export const TOAST_BOTTOM_CLEARANCE_VAR = '--orca-toast-bottom-clearance'
const GAP_PX = 8

const docked = new Set<HTMLElement>()
let published = 0

// Why measure every element each time: one appearing can move another without resizing it
// (the bulk bar's padding lifts the sticky Git History dock).
function publish(): void {
  let highest = 0
  for (const el of docked) {
    const rect = el.getBoundingClientRect()
    // Why: hidden chrome (Suspense re-suspending sets display:none) measures top 0 and would push toasts off-screen.
    if (rect.height === 0) {
      continue
    }
    highest = Math.max(highest, window.innerHeight - rect.top + GAP_PX)
  }
  const next = Math.ceil(highest)
  // Why: a custom property on <html> restyles the whole page, so skip unchanged writes.
  if (next === published) {
    return
  }
  published = next
  const root = document.documentElement.style
  if (next > 0) {
    root.setProperty(TOAST_BOTTOM_CLEARANCE_VAR, `${next}px`)
  } else {
    root.removeProperty(TOAST_BOTTOM_CLEARANCE_VAR)
  }
}

/** Ref callback: keeps toasts above the element while it is mounted. Stable, so React only calls it on mount. */
export function toastBottomClearanceRef(el: HTMLElement | null): (() => void) | undefined {
  if (!el) {
    return undefined
  }
  // Why: the bulk bar slides in with a transform, which ResizeObserver does not report.
  const onAnimationEnd = (event: AnimationEvent): void => {
    if (event.target === el) {
      publish()
    }
  }
  docked.add(el)
  publish()
  const observer = new ResizeObserver(publish)
  observer.observe(el)
  el.addEventListener('animationend', onAnimationEnd)
  return () => {
    observer.disconnect()
    el.removeEventListener('animationend', onAnimationEnd)
    docked.delete(el)
    // Why: ref cleanup can run before the same commit drops the padding that raised the others.
    queueMicrotask(publish)
  }
}
