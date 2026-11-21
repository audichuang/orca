import { useCallback, useRef } from 'react'
import type { DiffOnMount } from '@monaco-editor/react'
import type { IRange } from 'monaco-editor'

type KeptModel = {
  getValue(): string
  getFullModelRange(): IRange
  pushEditOperations(
    beforeCursorState: null,
    editOperations: { range: IRange; text: string }[],
    cursorStateComputer: () => null
  ): unknown
}

/** Brings a reused Monaco model up to `value` as one undoable edit; @monaco-editor/react reuses kept models without resetting them. */
export function syncKeptModelValue(model: KeptModel | null, value: string): boolean {
  if (!model || model.getValue() === value) {
    return false
  }
  model.pushEditOperations(null, [{ range: model.getFullModelRange(), text: value }], () => null)
  return true
}

/** Wraps a diff editor's onMount so a reused kept modified model first catches up to `value`; reads the latest props because Monaco calls onMount once. */
export function useKeptModelSync(
  onMount: DiffOnMount,
  value: string,
  enabled: boolean | undefined
): DiffOnMount {
  const latest = useRef({ onMount, value, enabled })
  latest.current = { onMount, value, enabled }
  return useCallback((diffEditor, monaco) => {
    if (latest.current.enabled) {
      syncKeptModelValue(diffEditor.getModifiedEditor().getModel(), latest.current.value)
    }
    latest.current.onMount(diffEditor, monaco)
  }, [])
}
