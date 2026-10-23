import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'
import { installMonacoDiffChangeNavigationShortcut } from './editor-shortcuts'
import type { DiffDirection } from './diff-change-boundary'
import type { DiffFilePosition } from './diff-file-sequence'
import { useDiffFileBoundaryNavigation } from './use-diff-file-boundary-navigation'

export type DiffEditorRegistrationContextValue = {
  registerDiffEditor: (editor: editor.IStandaloneDiffEditor) => void
  unregisterDiffEditor: (editor: editor.IStandaloneDiffEditor) => void
  hasFileArrival: () => boolean
}

export type DiffNavigationContextValue = {
  goToPreviousDiff: () => void
  goToNextDiff: () => void
  changeCount: number
  filePosition: DiffFilePosition | null
  fileBoundaryHint: DiffDirection | null
}

const noop = (): void => {}

// Separate registration from counts so diff recomputation rerenders header controls without waking Monaco consumers.
const DiffEditorRegistrationContext = createContext<DiffEditorRegistrationContextValue>({
  registerDiffEditor: noop,
  unregisterDiffEditor: noop,
  hasFileArrival: () => false
})

const DiffNavigationContext = createContext<DiffNavigationContextValue>({
  goToPreviousDiff: noop,
  goToNextDiff: noop,
  changeCount: 0,
  filePosition: null,
  fileBoundaryHint: null
})

function countChanges(diffEditor: editor.IStandaloneDiffEditor): number {
  return diffEditor.getLineChanges()?.length ?? 0
}

export function DiffNavigationProvider({
  children,
  filePosition = null
}: {
  children: React.ReactNode
  filePosition?: DiffFilePosition | null
}): React.JSX.Element {
  const fileBoundary = useDiffFileBoundaryNavigation(filePosition)
  const { navigate, onDiffUpdated, hasFileArrival } = fileBoundary
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null)
  const updateSubRef = useRef<{ dispose: () => void } | null>(null)
  // Share the registered editor across header buttons and F7/Shift+F7 shortcuts.
  const shortcutCleanupRef = useRef<(() => void) | null>(null)
  // Use state so sibling header controls repaint when diff computation changes their enabled state.
  const [changeCount, setChangeCount] = useState(0)

  const registerDiffEditor = useCallback(
    (diffEditor: editor.IStandaloneDiffEditor) => {
      editorRef.current = diffEditor
      updateSubRef.current?.dispose()
      updateSubRef.current = diffEditor.onDidUpdateDiff(() => {
        // Ignore stale editor callbacks after a fast registration swap.
        if (editorRef.current === diffEditor) {
          setChangeCount(countChanges(diffEditor))
          onDiffUpdated(diffEditor)
        }
      })
      shortcutCleanupRef.current?.()
      shortcutCleanupRef.current = installMonacoDiffChangeNavigationShortcut({
        getContainerDomNode: () => diffEditor.getContainerDomNode(),
        goToDiff: (direction) => navigate(diffEditor, direction)
      })
      setChangeCount(countChanges(diffEditor))
    },
    [navigate, onDiffUpdated]
  )

  const unregisterDiffEditor = useCallback((diffEditor: editor.IStandaloneDiffEditor) => {
    // A stale disposal must not clear a newly registered replacement editor.
    if (editorRef.current !== diffEditor) {
      return
    }
    updateSubRef.current?.dispose()
    updateSubRef.current = null
    shortcutCleanupRef.current?.()
    shortcutCleanupRef.current = null
    editorRef.current = null
    setChangeCount(0)
  }, [])

  const goToPreviousDiff = useCallback(() => {
    navigate(editorRef.current, 'previous')
  }, [navigate])

  const goToNextDiff = useCallback(() => {
    navigate(editorRef.current, 'next')
  }, [navigate])

  useEffect(() => {
    return () => {
      updateSubRef.current?.dispose()
      updateSubRef.current = null
      shortcutCleanupRef.current?.()
      shortcutCleanupRef.current = null
    }
  }, [])

  const registrationValue = useMemo(
    () => ({ registerDiffEditor, unregisterDiffEditor, hasFileArrival }),
    [registerDiffEditor, unregisterDiffEditor, hasFileArrival]
  )
  const navigationValue = useMemo(
    () => ({
      goToPreviousDiff,
      goToNextDiff,
      changeCount,
      filePosition,
      fileBoundaryHint: fileBoundary.armedDirection
    }),
    [goToPreviousDiff, goToNextDiff, changeCount, filePosition, fileBoundary.armedDirection]
  )

  return (
    <DiffEditorRegistrationContext.Provider value={registrationValue}>
      <DiffNavigationContext.Provider value={navigationValue}>
        {children}
      </DiffNavigationContext.Provider>
    </DiffEditorRegistrationContext.Provider>
  )
}

export function useDiffEditorRegistration(): DiffEditorRegistrationContextValue {
  return useContext(DiffEditorRegistrationContext)
}

export function useDiffNavigation(): DiffNavigationContextValue {
  return useContext(DiffNavigationContext)
}
