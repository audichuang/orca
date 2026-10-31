// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import {
  DiffNavigationProvider,
  useDiffEditorRegistration,
  useDiffNavigation
} from './diff-navigation-context'
import { useDiffViewerFirstChangeAutoScroll } from './useDiffViewerFirstChangeAutoScroll'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function navigationHarness(ready = true) {
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id)
  })
  const flushFrame = () =>
    act(() => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(0))
    })
  let line = 1
  const listeners = new Set<() => void>()
  const modified = {
    getPosition: () => ({ lineNumber: line, column: 1 }),
    getModel: () => ({ getLineCount: () => 10 }),
    setPosition: (position: { lineNumber: number }) => {
      line = position.lineNumber
    },
    getTopForLineNumber: () => 0,
    getLayoutInfo: () => ({ height: 400 }),
    setScrollTop: () => {},
    revealLineInCenter: () => {}
  }
  const fakeDiff = {
    getModifiedEditor: () => modified,
    getContainerDomNode: () => document.createElement('div'),
    getLineChanges: () =>
      [2, 7].map((start) => ({ modifiedStartLineNumber: start, modifiedEndLineNumber: start })),
    goToDiff: () => {},
    onDidUpdateDiff: (listener: () => void) => {
      listeners.add(listener)
      return { dispose: () => listeners.delete(listener) }
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the real provider and auto-scroll hook only use the Monaco members implemented above.
  const diff = fakeDiff as unknown as editor.IStandaloneDiffEditor
  const ref = { current: diff }
  let index = 1
  const open = vi.fn()
  const { result, rerender } = renderHook(
    () => {
      const registration = useDiffEditorRegistration()
      const navigation = useDiffNavigation()
      useDiffViewerFirstChangeAutoScroll({
        diffEditorRef: ref,
        modifiedEditor: ready ? diff.getModifiedEditor() : null,
        modelKey: 'target-file',
        pendingScrollCommentId: null
      })
      return { registration, navigation }
    },
    {
      wrapper: ({ children }) => (
        <DiffNavigationProvider
          filePosition={{ key: `list/${index}`, keyAt: (i) => `list/${i}`, index, total: 3, open }}
        >
          {children}
        </DiffNavigationProvider>
      )
    }
  )
  act(() => result.current.registration.registerDiffEditor(diff))
  return {
    open,
    flushFrame,
    line: () => line,
    previous: () => act(() => result.current.navigation.goToPreviousDiff()),
    update: () => act(() => listeners.forEach((listener) => listener())),
    setIndex: (next: number) => {
      index = next
      rerender()
    },
    setReady: (next: boolean) => {
      ready = next
      rerender()
    }
  }
}

it('yields a queued first-change scroll when previous-file arrival takes over before the frame', () => {
  const h = navigationHarness()
  h.previous()
  h.previous()
  expect(h.open).toHaveBeenCalledWith(0)
  h.setIndex(0)
  h.update()
  h.flushFrame()
  expect(h.line()).toBe(1)
  h.flushFrame()
  expect(h.line()).toBe(7)
})

it('keeps an arrived cursor when only the file-list context changes', () => {
  const h = navigationHarness(false)
  h.previous()
  h.previous()
  h.setIndex(0)
  h.update()
  h.flushFrame()
  h.flushFrame()
  expect(h.line()).toBe(7)
  h.setReady(true)
  h.flushFrame()
  h.setIndex(1)
  h.update()
  h.flushFrame()
  expect(h.line()).toBe(7)
})
