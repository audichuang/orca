// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import { hasDiffChangeInDirection } from './diff-change-boundary'
import {
  DiffNavigationProvider,
  useDiffEditorRegistration,
  useDiffNavigation,
  type DiffEditorRegistrationContextValue,
  type DiffNavigationContextValue
} from './diff-navigation-context'
import type { DiffFilePosition } from './diff-file-sequence'
import { useDiffViewerFirstChangeAutoScroll } from './useDiffViewerFirstChangeAutoScroll'

type Change = Pick<editor.ILineChange, 'modifiedStartLineNumber' | 'modifiedEndLineNumber'>

function fakeDiffEditor(changes: Change[], lineCount: number) {
  let line = 1
  const goToDiff = vi.fn()
  const updateListeners = new Set<() => void>()
  const modifiedEditor = {
    getPosition: () => ({ lineNumber: line, column: 1 }),
    getModel: () => ({ getLineCount: () => lineCount }),
    setPosition: (position: { lineNumber: number }) => {
      line = position.lineNumber
    },
    revealLineInCenter: vi.fn(),
    getTopForLineNumber: () => 0,
    getLayoutInfo: () => ({ height: 400 }),
    setScrollTop: vi.fn()
  }
  const diffEditor = {
    getLineChanges: () => changes,
    getModifiedEditor: () => modifiedEditor,
    goToDiff,
    getContainerDomNode: () => document.createElement('div'),
    onDidUpdateDiff: (listener: () => void) => {
      updateListeners.add(listener)
      return {
        dispose: () => {
          updateListeners.delete(listener)
        }
      }
    }
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the provider only calls the members faked above.
    diffEditor: diffEditor as unknown as editor.IStandaloneDiffEditor,
    goToDiff,
    updateDiff: () => updateListeners.forEach((listener) => listener()),
    moveTo: (next: number) => {
      line = next
    }
  }
}

describe('hasDiffChangeInDirection', () => {
  const changes: Change[] = [
    { modifiedStartLineNumber: 3, modifiedEndLineNumber: 4 },
    // A deletion below line 9 is reported as 9 with end 0; goToDiff lands on 10.
    { modifiedStartLineNumber: 9, modifiedEndLineNumber: 0 }
  ]

  it('mirrors goToDiff, which wraps instead of moving on past the last change', () => {
    const { diffEditor, moveTo } = fakeDiffEditor(changes, 20)
    moveTo(9)
    expect(hasDiffChangeInDirection(diffEditor, 'next')).toBe(true)
    moveTo(10)
    expect(hasDiffChangeInDirection(diffEditor, 'next')).toBe(false)
    expect(hasDiffChangeInDirection(diffEditor, 'previous')).toBe(true)
    moveTo(3)
    expect(hasDiffChangeInDirection(diffEditor, 'previous')).toBe(false)
  })

  it('treats the last line as a boundary because goToDiff wraps from there', () => {
    const { diffEditor, moveTo } = fakeDiffEditor(
      [{ modifiedStartLineNumber: 20, modifiedEndLineNumber: 20 }],
      20
    )
    moveTo(19)
    expect(hasDiffChangeInDirection(diffEditor, 'next')).toBe(true)
    moveTo(20)
    expect(hasDiffChangeInDirection(diffEditor, 'next')).toBe(false)
  })
})

function listPosition(
  list: string,
  index: number,
  open: DiffFilePosition['open']
): DiffFilePosition {
  return { key: `${list}/${index}`, keyAt: (i) => `${list}/${i}`, index, total: 3, open }
}

describe('DiffNavigationProvider across a file list', () => {
  let root: Root | null = null
  let nav: DiffNavigationContextValue | null = null
  let registration: DiffEditorRegistrationContextValue | null = null

  function Probe(): null {
    nav = useDiffNavigation()
    registration = useDiffEditorRegistration()
    return null
  }

  function AutoScroll({
    diffEditor,
    ready
  }: {
    diffEditor: editor.IStandaloneDiffEditor
    ready: boolean
  }): null {
    const diffEditorRef = useRef(diffEditor)
    const { filePosition } = useDiffNavigation()
    useDiffViewerFirstChangeAutoScroll({
      diffEditorRef,
      modifiedEditor: ready ? diffEditor.getModifiedEditor() : null,
      modelKey: filePosition?.key ?? 'no-file',
      pendingScrollCommentId: null
    })
    return null
  }

  function mount(
    filePosition: DiffFilePosition | null,
    autoScroll?: { diffEditor: editor.IStandaloneDiffEditor; ready: boolean }
  ): void {
    if (!root) {
      const container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
    }
    act(() => {
      root?.render(
        <DiffNavigationProvider filePosition={filePosition}>
          <Probe />
          {autoScroll && <AutoScroll {...autoScroll} />}
        </DiffNavigationProvider>
      )
    })
  }

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(['next', 'previous'] as const)(
    'keeps %s arrival when first-change initialization runs after the arrival frames',
    (direction) => {
      const frames: FrameRequestCallback[] = []
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.push(callback)
        return frames.length
      })
      const flushFrame = (): void => {
        act(() => frames.splice(0).forEach((callback) => callback(0)))
      }
      const open = vi.fn()
      const targetIndex = direction === 'previous' ? 0 : 2
      mount(listPosition('arrival', 1, open))
      const { diffEditor, moveTo, updateDiff } = fakeDiffEditor(
        [
          { modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 },
          { modifiedStartLineNumber: 7, modifiedEndLineNumber: 7 }
        ],
        9
      )
      act(() => registration!.registerDiffEditor(diffEditor))
      moveTo(direction === 'previous' ? 2 : 7)
      const navigate = (): void => {
        act(() => {
          if (direction === 'previous') {
            nav!.goToPreviousDiff()
          } else {
            nav!.goToNextDiff()
          }
        })
      }
      navigate()
      navigate()
      expect(open).toHaveBeenCalledWith(targetIndex)
      mount(listPosition('arrival', targetIndex, open), { diffEditor, ready: false })
      moveTo(1)
      act(() => updateDiff())
      flushFrame()
      flushFrame()
      const arrivalLine = direction === 'previous' ? 7 : 2
      expect(diffEditor.getModifiedEditor().getPosition()?.lineNumber).toBe(arrivalLine)

      mount(listPosition('arrival', targetIndex, open), { diffEditor, ready: true })
      flushFrame()
      expect(diffEditor.getModifiedEditor().getPosition()?.lineNumber).toBe(arrivalLine)
      moveTo(5)
      act(() => updateDiff())
      flushFrame()
      flushFrame()
      expect(diffEditor.getModifiedEditor().getPosition()?.lineNumber).toBe(5)

      moveTo(1)
      mount(listPosition('unrelated', 0, open), { diffEditor, ready: true })
      flushFrame()
      expect(diffEditor.getModifiedEditor().getPosition()?.lineNumber).toBe(2)
    }
  )

  it('arms a hint at the last change and opens the next file on the second press', () => {
    const open = vi.fn()
    mount(listPosition('list-a', 1, open))
    const { diffEditor, goToDiff, moveTo } = fakeDiffEditor(
      [{ modifiedStartLineNumber: 5, modifiedEndLineNumber: 6 }],
      30
    )
    act(() => registration!.registerDiffEditor(diffEditor))
    moveTo(5)

    act(() => nav!.goToNextDiff())
    expect(goToDiff).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    expect(nav!.fileBoundaryHint).toBe('next')

    act(() => nav!.goToNextDiff())
    expect(open).toHaveBeenCalledWith(2)
    expect(nav!.fileBoundaryHint).toBeNull()
  })

  it('re-arms instead of leaving when the cursor moved or the hint expired', () => {
    vi.useFakeTimers()
    const open = vi.fn()
    mount(listPosition('list-a', 1, open))
    const { diffEditor, moveTo } = fakeDiffEditor(
      [{ modifiedStartLineNumber: 5, modifiedEndLineNumber: 6 }],
      30
    )
    act(() => registration!.registerDiffEditor(diffEditor))
    moveTo(5)
    act(() => nav!.goToPreviousDiff())
    moveTo(4)
    act(() => nav!.goToPreviousDiff())
    expect(open).not.toHaveBeenCalled()
    expect(nav!.fileBoundaryHint).toBe('previous')

    act(() => vi.advanceTimersByTime(3000))
    expect(nav!.fileBoundaryHint).toBeNull()
    act(() => nav!.goToPreviousDiff())
    expect(open).not.toHaveBeenCalled()
  })

  it('steps from a diff without a Monaco editor, like an image or binary file', () => {
    const open = vi.fn()
    mount(listPosition('list-a', 1, open))

    act(() => nav!.goToNextDiff())
    expect(nav!.fileBoundaryHint).toBe('next')
    act(() => nav!.goToNextDiff())
    expect(open).toHaveBeenCalledWith(2)
  })

  it('forgets the armed hint when the pane switches to another list at the same index', () => {
    const openA = vi.fn()
    const openB = vi.fn()
    mount(listPosition('list-a', 1, openA))
    const { diffEditor, moveTo } = fakeDiffEditor(
      [{ modifiedStartLineNumber: 5, modifiedEndLineNumber: 6 }],
      30
    )
    act(() => registration!.registerDiffEditor(diffEditor))
    moveTo(5)
    act(() => nav!.goToNextDiff())
    expect(nav!.fileBoundaryHint).toBe('next')

    mount(listPosition('list-b', 1, openB))
    act(() => nav!.goToNextDiff())
    expect(openB).not.toHaveBeenCalled()
    expect(nav!.fileBoundaryHint).toBe('next')
  })

  it('keeps Monaco wrap-around at the ends of the list', () => {
    const open = vi.fn()
    mount(listPosition('list-a', 2, open))
    const { diffEditor, goToDiff, moveTo } = fakeDiffEditor(
      [{ modifiedStartLineNumber: 5, modifiedEndLineNumber: 6 }],
      30
    )
    act(() => registration!.registerDiffEditor(diffEditor))
    moveTo(5)
    act(() => nav!.goToNextDiff())
    expect(goToDiff).toHaveBeenCalledWith('next')
    expect(nav!.fileBoundaryHint).toBeNull()
  })
})
