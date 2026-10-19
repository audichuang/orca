// Fork-only: Cmd/Ctrl- and Shift-click multi-selection inside one expanded commit's file list.

export type CommitFileSelection = {
  selected: ReadonlySet<string>
  anchor: string | null
  /** Row of the last plain click; a following Cmd/Ctrl-click folds it in (same as the changes list). */
  plainClicked: string | null
}

export const EMPTY_COMMIT_FILE_SELECTION: CommitFileSelection = {
  selected: new Set(),
  anchor: null,
  plainClicked: null
}

type ClickModifiers = { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

/** `handled` = the click only changed the selection, so the row must not also open. */
export function applyCommitFileClick(
  state: CommitFileSelection,
  orderedPaths: readonly string[],
  path: string,
  event: ClickModifiers,
  isMac: boolean
): { state: CommitFileSelection; handled: boolean } {
  // Alt opens a split (upstream's row semantics); it and a plain click both drop the bulk selection.
  if (event.altKey) {
    return { state: EMPTY_COMMIT_FILE_SELECTION, handled: false }
  }
  if (event.shiftKey) {
    const from = state.anchor === null ? -1 : orderedPaths.indexOf(state.anchor)
    const to = orderedPaths.indexOf(path)
    if (from !== -1 && to !== -1) {
      const range = orderedPaths.slice(Math.min(from, to), Math.max(from, to) + 1)
      return { state: { ...state, selected: new Set(range), plainClicked: null }, handled: true }
    }
  } else if (isMac ? event.metaKey : event.ctrlKey) {
    const selected = new Set(state.selected)
    if (selected.has(path)) {
      selected.delete(path)
    } else {
      if (selected.size === 0 && state.plainClicked !== null) {
        selected.add(state.plainClicked)
      }
      selected.add(path)
    }
    return { state: { selected, anchor: path, plainClicked: null }, handled: true }
  }
  return { state: { selected: new Set(), anchor: path, plainClicked: path }, handled: false }
}

/** Right-click keeps a selection that contains the row, otherwise retargets it to that row alone. */
export function applyCommitFileContextMenu(
  state: CommitFileSelection,
  path: string
): CommitFileSelection {
  return state.selected.has(path)
    ? { ...state, plainClicked: null }
    : { selected: new Set([path]), anchor: path, plainClicked: null }
}
