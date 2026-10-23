import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { setWithLRU } from '@/lib/scroll-cache'

export type DiffFileSequenceStep = {
  /** Tab id (`commitDiffTabId`) of the diff this step opens. */
  key: string
  open: (targetGroupId: string | undefined) => void
}

export type DiffFilePosition = {
  /** Tab id of the active diff; changes whenever the pane shows another file. */
  key: string
  keyAt: (index: number) => string | undefined
  index: number
  total: number
  /** Opens neighbour `index` in the split group the active diff sits in. */
  open: (index: number) => void
}

/** `opened` orders the registrations that opened this step's diff; 0 when it was only listed. */
type FileListEntry = { steps: readonly DiffFileSequenceStep[]; index: number; opened: number }

const MAX_SEQUENCE_KEYS = 5000

// Why in memory: a restored session has no file list, so its diff tabs keep in-file navigation only.
const fileListByTabId = new Map<string, FileListEntry>()
// The list each tab last showed, so an overlapping list registered elsewhere cannot take it over.
const fileListByViewStateId = new Map<string, FileListEntry>()
let openedCount = 0

/** Remembers the file list a diff was opened from, so change navigation can continue into its neighbours. */
export function registerDiffFileSequence(
  steps: readonly DiffFileSequenceStep[],
  openedKey: string | undefined
): void {
  openedCount += 1
  steps.forEach((step, index) =>
    setWithLRU(
      fileListByTabId,
      step.key,
      { steps, index, opened: step.key === openedKey ? openedCount : 0 },
      MAX_SEQUENCE_KEYS
    )
  )
}

function listedFor(fileId: string, viewStateId: string | undefined): FileListEntry | undefined {
  const latest = fileListByTabId.get(fileId)
  const shown = viewStateId ? fileListByViewStateId.get(viewStateId) : undefined
  // Why: only reopening this file from a list replaces the one its tab already shows.
  const listed =
    shown && shown.steps[shown.index]?.key === fileId && (latest?.opened ?? 0) <= shown.opened
      ? shown
      : latest
  if (viewStateId && listed) {
    setWithLRU(fileListByViewStateId, viewStateId, listed, MAX_SEQUENCE_KEYS)
  }
  return listed
}

export function getDiffFilePosition(
  file: Pick<OpenFile, 'id' | 'mode' | 'diffSource'> | null,
  targetGroupId: () => string | undefined = () => undefined,
  viewStateId?: string
): DiffFilePosition | null {
  const listed =
    file?.mode === 'diff' && file.diffSource === 'commit'
      ? listedFor(file.id, viewStateId)
      : undefined
  if (!file || !listed || listed.steps.length < 2) {
    return null
  }
  return {
    key: file.id,
    keyAt: (index) => listed.steps[index]?.key,
    index: listed.index,
    total: listed.steps.length,
    open: (index) => {
      // Why: another pane may have registered an overlapping list since; stepping keeps this one.
      const step = listed.steps[index]
      registerDiffFileSequence(listed.steps, step?.key)
      step?.open(targetGroupId())
    }
  }
}

/** The active diff's place in its file list; neighbours open in the split group it sits in. */
export function useDiffFilePosition(
  activeFile: OpenFile | null,
  activeViewStateId: string | null
): DiffFilePosition | null {
  return useMemo(
    () =>
      getDiffFilePosition(
        activeFile,
        () =>
          activeFile && activeViewStateId
            ? (useAppStore.getState().unifiedTabsByWorktree[activeFile.worktreeId] ?? []).find(
                (tab) => tab.id === activeViewStateId
              )?.groupId
            : undefined,
        activeViewStateId ?? undefined
      ),
    [activeFile, activeViewStateId]
  )
}
