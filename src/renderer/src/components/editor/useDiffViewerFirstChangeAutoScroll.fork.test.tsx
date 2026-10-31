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
it('yields a queued first-change scroll when previous-file arrival takes over before the frame', () => {
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
        modifiedEditor: diff.getModifiedEditor(),
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
  act(() => result.current.navigation.goToPreviousDiff())
  act(() => result.current.navigation.goToPreviousDiff())
  expect(open).toHaveBeenCalledWith(0)
  index = 0
  rerender()
  act(() => listeners.forEach((listener) => listener()))
  flushFrame()
  expect(line).toBe(1)
  flushFrame()
  expect(line).toBe(7)
})
