// Fork-only: selection, keyboard navigation and branch context for the full Git Graph.
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import type {
  GitHistoryGraphColorId,
  GitHistoryItem,
  GitHistoryResult
} from '../../../../../../shared/git-history'
import type { GitHistoryItemViewModel } from '../../../../../../shared/git-history-graph'
import type { GitHistoryGraphRefOption } from '../../../../../../shared/git-history-graph-query-types'
import {
  computeBranchContainment,
  type GitGraphBranchContainment
} from './git-graph-branch-containment'
import type { GitGraphCommitContext } from './git-graph-commit-info'
import { useGitHistoryGraphFilter } from './git-history-graph-filter'
import { loadRefOptions } from './git-history-graph-toolbar'
import {
  useGitHistoryCommitSelection,
  type CommitClickModifiers
} from './use-git-history-commit-selection'
import { rovingKeyTarget } from './git-graph-roving-keys'
import { useGitGraphReveal, type GitGraphRevealOptions } from './use-git-graph-reveal'
import {
  clearGitGraphRememberedSelections,
  peekRememberedGitGraphSelection,
  rememberGitGraphSelection
} from './git-graph-remembered-selection'

const PLAIN_CLICK: CommitClickModifiers = { metaKey: false, ctrlKey: false, shiftKey: false }

function isNavigable(viewModel: GitHistoryItemViewModel): boolean {
  return viewModel.kind !== 'incoming-changes' && viewModel.kind !== 'outgoing-changes'
}

export type GitGraphSelectionState = {
  selectedId: string | null
  shownItems: readonly GitHistoryItem[]
  /** The single roving tab stop of the commit list. */
  cursorId: string | null
  isRowSelected: (id: string) => boolean
  handleRowSelect: (item: GitHistoryItem, event: React.MouseEvent) => void
  handleListKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  /** Bumps on every selection gesture; a stale async jump compares it before acting. */
  getNavigationGeneration: () => number
  /** `focus` moves keyboard focus to the row, for callers whose own control is going away. */
  jumpTo: (commitId: string, options?: { focus?: boolean }) => void
}

export function useGitGraphSelection(args: {
  /** Host-qualified worktree identity (composeWorktreeHostIdentity). */
  selectionKey: string
  /** The hosting tab; its memory is dropped together with the tab. */
  selectionScope?: string
  result: GitHistoryResult | undefined
  viewModels: readonly GitHistoryItemViewModel[]
  listRef: React.RefObject<HTMLDivElement | null>
  /** Pick the checked-out commit once the first history lands, unless a selection exists. */
  selectHeadOnOpen?: boolean
  /** One-shot commit to select and scroll to; it wins over the checked-out pick. */
  reveal?: GitGraphRevealOptions
}): GitGraphSelectionState {
  const { selectionKey, result, viewModels, listRef, selectHeadOnOpen = false } = args
  const selectionScope = args.selectionScope ?? ''
  const [remembered] = useState(() => peekRememberedGitGraphSelection(selectionScope, selectionKey))
  const [selectedId, setSelectedIdState] = useState<string | null>(remembered?.commitId ?? null)
  // Why the anchor first: it is the latest gesture, a multi-selection's included.
  const [cursorState, setCursorId] = useState<string | null>(
    remembered?.commits?.anchor ?? selectedId
  )
  const setSelectedId = useCallback(
    (id: string | null): void => {
      setSelectedIdState(id)
      // Why also on null: a cleared click must not come back as selected after a remount.
      rememberGitGraphSelection(selectionScope, selectionKey, (entry) => ({
        commits: null,
        ...entry,
        commitId: id
      }))
    },
    [selectionKey, selectionScope]
  )
  const selected = result?.items.find((item) => item.id === selectedId) ?? null
  // Why retain: a refresh or branch filter must not drop a multi-selection the user is reviewing.
  const commitSelection = useGitHistoryCommitSelection(result, {
    retainAcrossResults: { ownerKey: selectionKey, initial: remembered?.commits ?? undefined }
  })
  const { snapshot } = commitSelection
  useEffect(() => {
    rememberGitGraphSelection(selectionScope, selectionKey, (entry) => ({
      commitId: entry?.commitId ?? null,
      commits: snapshot
    }))
  }, [selectionKey, selectionScope, snapshot])
  const multiSelected = commitSelection.selectedItems
  const shownItems = useMemo(
    () => (multiSelected.length > 0 ? multiSelected : selected ? [selected] : []),
    [multiSelected, selected]
  )
  const navigable = useMemo(
    () => viewModels.filter(isNavigable).map((viewModel) => viewModel.historyItem),
    [viewModels]
  )
  const cursorId =
    cursorState && navigable.some((item) => item.id === cursorState)
      ? cursorState
      : (navigable[0]?.id ?? null)

  const scrollToRow = useCallback(
    (id: string, focus: boolean, block: ScrollLogicalPosition = 'nearest'): void => {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-commit-id="${id}"]`)
      row?.scrollIntoView({ block })
      if (focus) {
        row?.focus()
      }
    },
    [listRef]
  )

  // Why once: a remount restores the remembered commit, or the multi-selection's cursor, into view.
  const restoreTargetId = selected?.id ?? (multiSelected.length > 0 ? cursorId : null)
  const restoredRef = useRef(false)
  useEffect(() => {
    if (!restoredRef.current && restoreTargetId) {
      restoredRef.current = true
      scrollToRow(restoreTargetId, false)
    }
  }, [scrollToRow, restoreTargetId])

  const navigationGenerationRef = useRef(0)
  const getNavigationGeneration = useCallback(() => navigationGenerationRef.current, [])

  // Why skip a remembered entry: returning to the tab restores what was there, an empty pick included.
  const headPickedRef = useRef(!selectHeadOnOpen || remembered !== undefined)
  const select = useCallback(
    (item: GitHistoryItem, modifiers: CommitClickModifiers) => {
      // Why the fallback anchor: a restored or refreshed selection has no click anchor yet, so the
      // first Shift gesture would otherwise drop the selected commit from its own range.
      navigationGenerationRef.current += 1
      const handled = commitSelection.handleRowClick(item, modifiers, selectedId)
      // Why clear on a gesture: emptying the multi-selection must not fall back to an old click.
      setSelectedId(handled ? null : item.id)
      setCursorId(item.id)
    },
    [commitSelection, selectedId, setSelectedId]
  )

  const handleListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>): void => {
      // Why: keys from the portaled row context menu bubble here through React; leave them to it.
      if (
        event.defaultPrevented ||
        !(event.target instanceof Node) ||
        !event.currentTarget.contains(event.target)
      ) {
        return
      }
      const index = navigable.findIndex((item) => item.id === cursorId)
      const nextIndex = rovingKeyTarget(event.key, index, navigable.length)
      if (nextIndex === null) {
        return
      }
      event.preventDefault()
      const next = navigable[nextIndex]
      if (!next) {
        return
      }
      // Why the hook's click path: Shift+Arrow then extends the range from the anchor for free.
      select(next, { metaKey: false, ctrlKey: false, shiftKey: event.shiftKey })
      scrollToRow(next.id, true)
    },
    [cursorId, navigable, scrollToRow, select]
  )

  const jumpTo = useCallback(
    (commitId: string, options?: { focus?: boolean }): void => {
      const item = result?.items.find((candidate) => candidate.id === commitId)
      if (item) {
        select(item, PLAIN_CLICK)
        // Why centered: a jump lands far from where the eye was; rows on both sides orient it.
        scrollToRow(commitId, options?.focus ?? false, 'center')
      }
    },
    [result, scrollToRow, select]
  )

  // Why after jumpTo: a reveal selects through it, and the checked-out pick below waits for it.
  const revealPending = useGitGraphReveal(args.reveal, result, jumpTo)
  useEffect(() => {
    if (
      headPickedRef.current ||
      revealPending ||
      selectedId !== null ||
      multiSelected.length > 0 ||
      navigationGenerationRef.current > 0
    ) {
      return
    }
    const headRefId = result?.currentRef?.id
    // Why the revision first: a detached HEAD has no ref decoration on its row.
    const headRevision = result?.currentRef?.revision
    const head =
      (headRevision && navigable.find((item) => item.id === headRevision)) ||
      (headRefId &&
        navigable.find((item) => item.references?.some((ref) => ref.id === headRefId))) ||
      navigable[0]
    // Why wait for a row: a filter that matches nothing must not spend the one pick.
    if (!head) {
      return
    }
    headPickedRef.current = true
    // Why not select(): that bumps the generation, which would cancel a pending branch-tip jump.
    setSelectedId(head.id)
    setCursorId(head.id)
  }, [multiSelected.length, navigable, result, revealPending, selectedId, setSelectedId])

  return {
    selectedId,
    shownItems,
    cursorId,
    isRowSelected: (id) =>
      multiSelected.length > 0 ? commitSelection.isSelected(id) : id === selectedId,
    handleRowSelect: select,
    handleListKeyDown,
    getNavigationGeneration,
    jumpTo
  }
}

export type GitGraphBranchContext = {
  refOptions: readonly GitHistoryGraphRefOption[] | null
  containment: GitGraphBranchContainment
  headRefId?: string
  /** Off-branch muting is meaningful: the checked-out tip is loaded and ancestry is complete. */
  canDim: boolean
  commitContext: GitGraphCommitContext
}

export function useGitGraphBranchContext(args: {
  /** Host-qualified repo owner identity; the ref list is refetched when it changes. */
  ownerKey: string
  worktreeId: string
  /** The filter the view shows; its search makes ancestry unknown. */
  filterKey: string
  worktreePath: string
  activeRepoTarget: RuntimeClientTarget | null
  result: GitHistoryResult | undefined
  viewModels: readonly GitHistoryItemViewModel[]
  jumpTo: GitGraphSelectionState['jumpTo']
}): GitGraphBranchContext {
  const {
    ownerKey: refOwnerKey,
    worktreeId,
    filterKey,
    worktreePath,
    activeRepoTarget,
    result,
    viewModels,
    jumpTo
  } = args
  // Why keyed by owner: the repo can move hosts with the same worktree, and a late reply must not land.
  const [fetchedRefs, setFetchedRefs] = useState<{
    key: string
    refs: readonly GitHistoryGraphRefOption[] | null
  } | null>(null)
  const refOptions = fetchedRefs?.key === refOwnerKey ? fetchedRefs.refs : null
  // Why a ref: callers may pass a fresh target object each render; refetch only when the owner changes.
  const repoTargetRef = useRef(activeRepoTarget)
  useEffect(() => {
    repoTargetRef.current = activeRepoTarget
  })
  useEffect(() => {
    let current = true
    loadRefOptions({ worktreeId, worktreePath, activeRepoTarget: repoTargetRef.current })
      .then((graph) => current && setFetchedRefs({ key: refOwnerKey, refs: graph?.refs ?? null }))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [refOwnerKey, worktreeId, worktreePath])

  // Why: a search drops in-between commits, so ancestry through them is unknown, not "off branch" —
  // and so is a searched result still on screen after the query clears, until fresh history replaces it.
  const searching = useGitHistoryGraphFilter(filterKey).query.trim() !== ''
  const [searchedResult, setSearchedResult] = useState<GitHistoryResult | undefined>(undefined)
  if (searching && result && searchedResult !== result) {
    setSearchedResult(result)
  }
  const ancestryUnknown = searching || (result !== undefined && result === searchedResult)
  const containment = useMemo(
    () =>
      ancestryUnknown
        ? new Map<string, readonly string[]>()
        : computeBranchContainment(result?.items ?? []),
    [result, ancestryUnknown]
  )
  const headRefId = result?.currentRef?.id
  const canDim =
    !ancestryUnknown &&
    headRefId !== undefined &&
    (result?.items ?? []).some((item) => item.references?.some((ref) => ref.id === headRefId))

  const commitContext = useMemo((): GitGraphCommitContext => {
    const branchNames = new Map<string, string>()
    for (const ref of result?.graph?.refs ?? []) {
      branchNames.set(ref.fullName, ref.name)
    }
    for (const item of result?.items ?? []) {
      for (const ref of item.references ?? []) {
        if (!branchNames.has(ref.id)) {
          branchNames.set(ref.id, ref.name)
        }
      }
    }
    const refColors = new Map<string, GitHistoryGraphColorId>()
    for (const viewModel of viewModels) {
      for (const ref of viewModel.historyItem.references ?? []) {
        if (ref.color) {
          refColors.set(ref.id, ref.color)
        }
      }
    }
    return {
      refColors,
      itemsById: new Map((result?.items ?? []).map((item) => [item.id, item])),
      containment,
      branchNames,
      headRefId,
      // Why focus: the clicked link unmounts with the old selection, and arrow keys must keep working.
      onJump: (commitId: string) => jumpTo(commitId, { focus: true })
    }
  }, [containment, headRefId, jumpTo, result, viewModels])

  return { refOptions, containment, headRefId, canDim, commitContext }
}

/** Test seam: the remembered selection outlives a dialog, so tests reset it between cases. */
export function resetGitGraphRememberedSelectionForTest(): void {
  clearGitGraphRememberedSelections()
}
