import type { editor } from 'monaco-editor'

export type DiffDirection = 'next' | 'previous'

type DiffChangeEditor = Pick<editor.IStandaloneDiffEditor, 'getLineChanges' | 'getModifiedEditor'>

function changeStartLine(change: editor.ILineChange): number {
  // Why: a deletion reports the line above it (end 0); Monaco's goToDiff compares the line below.
  return change.modifiedEndLineNumber === 0
    ? change.modifiedStartLineNumber + 1
    : change.modifiedStartLineNumber
}

/** Whether Monaco's goToDiff(direction) would move on rather than wrap around to the other end. */
export function hasDiffChangeInDirection(
  diffEditor: DiffChangeEditor,
  direction: DiffDirection
): boolean {
  const changes = diffEditor.getLineChanges()
  if (!changes || changes.length === 0) {
    return false
  }
  const modified = diffEditor.getModifiedEditor()
  const line = modified.getPosition()?.lineNumber ?? 1
  if (direction === 'previous') {
    return changes.some((change) => changeStartLine(change) < line)
  }
  // Mirrors goToDiff: on the last line 'next' wraps to the first change.
  if (line === modified.getModel()?.getLineCount()) {
    return false
  }
  return changes.some((change) => changeStartLine(change) > line)
}

/** Puts the cursor on the first change when arriving forward, the last when arriving backward. */
export function revealArrivalChange(diffEditor: DiffChangeEditor, arrival: DiffDirection): void {
  const changes = diffEditor.getLineChanges()
  const modified = diffEditor.getModifiedEditor()
  const lineCount = modified.getModel()?.getLineCount()
  const change = arrival === 'next' ? changes?.[0] : changes?.at(-1)
  if (!change || !lineCount) {
    return
  }
  const line = Math.min(Math.max(1, changeStartLine(change)), lineCount)
  modified.setPosition({ lineNumber: line, column: 1 })
  modified.revealLineInCenter(line)
}
