// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOAST_BOTTOM_CLEARANCE_VAR, toastBottomClearanceRef } from './toast-bottom-clearance'

function DockedChrome({ top, hidden }: { top: number; hidden?: boolean }) {
  return <div ref={toastBottomClearanceRef} data-top={top} data-hidden={hidden || undefined} />
}

const clearance = () => document.documentElement.style.getPropertyValue(TOAST_BOTTOM_CLEARANCE_VAR)

describe('toastBottomClearanceRef', () => {
  let root: Root
  let container: HTMLDivElement

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.dataset.hidden) {
        return new DOMRect(0, 0, 0, 0)
      }
      const top = Number(this.dataset.top ?? 0)
      return new DOMRect(0, top, 0, 1000 - top)
    })
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('lifts toasts above the tallest registered chrome and clears on unmount', async () => {
    act(() =>
      root.render(
        <>
          <DockedChrome top={940} />
          <DockedChrome top={900} />
        </>
      )
    )
    // 1000 - 900 + 8px gap
    expect(clearance()).toBe('108px')

    await act(async () => root.render(<DockedChrome top={940} />))
    expect(clearance()).toBe('68px')

    await act(async () => root.render(null))
    expect(clearance()).toBe('')
  })

  it('re-measures chrome that another one moved without resizing it', () => {
    act(() => root.render(<DockedChrome key="dock" top={900} />))
    expect(clearance()).toBe('108px')

    // The bulk bar mounts and its padding lifts the dock by 50px.
    act(() =>
      root.render(
        <>
          <DockedChrome key="dock" top={850} />
          <DockedChrome key="bar" top={940} />
        </>
      )
    )
    expect(clearance()).toBe('158px')
  })

  it('re-measures when its own slide-in animation ends, not a child animation', () => {
    act(() => root.render(<DockedChrome top={960} />))
    expect(clearance()).toBe('48px')

    const el = container.querySelector<HTMLElement>('[data-top]')
    expect(el).not.toBeNull()
    el!.dataset.top = '940'
    const child = document.createElement('span')
    el!.append(child)
    child.dispatchEvent(new Event('animationend', { bubbles: true }))
    expect(clearance()).toBe('48px')

    el!.dispatchEvent(new Event('animationend'))
    expect(clearance()).toBe('68px')
  })

  it('ignores chrome that is mounted but hidden', () => {
    act(() =>
      root.render(
        <>
          <DockedChrome top={940} />
          <DockedChrome top={0} hidden />
        </>
      )
    )
    expect(clearance()).toBe('68px')
  })
})
