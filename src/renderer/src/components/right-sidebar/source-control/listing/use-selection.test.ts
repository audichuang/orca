// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSourceControlSelection, type FlatEntry } from './use-selection'

const flatEntries: FlatEntry[] = ['a', 'b'].map((path) => ({
  key: `unstaged::${path}`,
  area: 'unstaged',
  entry: { path, status: 'modified', area: 'unstaged' }
}))

function setup(): ReturnType<
  typeof renderHook<ReturnType<typeof useSourceControlSelection>, void>
> & {
  container: HTMLElement
} {
  const container = document.createElement('div')
  document.body.append(container)
  const hook = renderHook(() =>
    useSourceControlSelection({
      flatEntries,
      onOpenDiff: vi.fn(),
      containerRef: { current: container }
    })
  )
  for (const { key, entry } of flatEntries) {
    act(() => {
      hook.result.current.handleSelect(
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: handleSelect only reads modifier keys.
        { shiftKey: false, metaKey: true, ctrlKey: true } as React.MouseEvent,
        key,
        entry
      )
    })
  }
  expect(hook.result.current.selectedKeys.size).toBe(2)
  return Object.assign(hook, { container })
}

function pointerDownOn(el: Element): void {
  act(() => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  })
}

describe('useSourceControlSelection outside pointerdown', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('keeps the selection when the pointerdown lands in a portaled menu', () => {
    const { result } = setup()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = document.createElement('div')
    menu.append(item)
    document.body.append(menu)
    pointerDownOn(item)
    expect(result.current.selectedKeys.size).toBe(2)
  })

  it('clears the selection on an ordinary outside pointerdown', () => {
    const { result } = setup()
    const outside = document.createElement('div')
    document.body.append(outside)
    pointerDownOn(outside)
    expect(result.current.selectedKeys.size).toBe(0)
  })
})

function clickEvent(modifiers: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: handleSelect only reads modifier keys.
  return { shiftKey: false, metaKey: false, ctrlKey: false, ...modifiers } as React.MouseEvent
}

describe('useSourceControlSelection click semantics', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  function render(): ReturnType<
    typeof renderHook<ReturnType<typeof useSourceControlSelection>, void>
  > {
    const container = document.createElement('div')
    document.body.append(container)
    return renderHook(() =>
      useSourceControlSelection({
        flatEntries,
        onOpenDiff: vi.fn(),
        containerRef: { current: container }
      })
    )
  }

  it('folds the plain-clicked row into the selection on the next Cmd/Ctrl-click', () => {
    const { result } = render()
    const [a, b] = flatEntries
    act(() => result.current.handleSelect(clickEvent({}), a.key, a.entry))
    expect(result.current.selectedKeys.size).toBe(0)
    act(() =>
      result.current.handleSelect(clickEvent({ metaKey: true, ctrlKey: true }), b.key, b.entry)
    )
    expect([...result.current.selectedKeys].sort()).toEqual([a.key, b.key])
  })

  it('keeps a lone Cmd/Ctrl-click on the clicked row to a single selection', () => {
    const { result } = render()
    const [a] = flatEntries
    act(() => result.current.handleSelect(clickEvent({}), a.key, a.entry))
    act(() =>
      result.current.handleSelect(clickEvent({ metaKey: true, ctrlKey: true }), a.key, a.entry)
    )
    expect([...result.current.selectedKeys]).toEqual([a.key])
  })

  it('does not resurrect a row deselected with Cmd/Ctrl-click', () => {
    const { result } = render()
    const [a, b] = flatEntries
    const cmd = clickEvent({ metaKey: true, ctrlKey: true })
    act(() => result.current.handleSelect(cmd, a.key, a.entry))
    act(() => result.current.handleSelect(cmd, a.key, a.entry))
    expect(result.current.selectedKeys.size).toBe(0)
    act(() => result.current.handleSelect(cmd, b.key, b.entry))
    expect([...result.current.selectedKeys]).toEqual([b.key])
  })

  it('does not clear the selection when Escape dismisses an open menu', () => {
    const { result } = setup()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    act(() => {
      menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(result.current.selectedKeys.size).toBe(2)
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(result.current.selectedKeys.size).toBe(0)
  })
})
