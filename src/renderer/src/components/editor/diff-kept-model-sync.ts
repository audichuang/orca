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
