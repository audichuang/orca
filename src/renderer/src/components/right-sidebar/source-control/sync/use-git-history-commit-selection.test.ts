// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { GitHistoryItem, GitHistoryResult } from '../../../../../../shared/git-history'
import { useGitHistoryCommitSelection } from './use-git-history-commit-selection'

const item = (id: string): GitHistoryItem => ({ id, parentIds: [], subject: id, message: id })
const [A, B, C] = [item('a'), item('b'), item('c')]
const result: GitHistoryResult = {
  items: [A, B, C],
  hasIncomingChanges: false,
  hasOutgoingChanges: false,
  hasMore: false,
  limit: 50
}

function click(modifiers: { toggle?: boolean; shiftKey?: boolean } = {}): {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
} {
  // Both Cmd and Ctrl so the gesture holds on every platform.
  const toggle = modifiers.toggle ?? false
  return { metaKey: toggle, ctrlKey: toggle, shiftKey: modifiers.shiftKey ?? false }
}

function selectedIds(hook: { current: ReturnType<typeof useGitHistoryCommitSelection> }): string[] {
  return hook.current.selectedItems.map((selected) => selected.id)
}

describe('useGitHistoryCommitSelection', () => {
  it('folds the plain-clicked commit into a following Cmd/Ctrl-click', () => {
    const { result: hook } = renderHook(() => useGitHistoryCommitSelection(result))
    act(() => void hook.current.handleRowClick(A, click()))
    act(() => void hook.current.handleRowClick(B, click({ toggle: true })))
    expect(selectedIds(hook)).toEqual(['a', 'b'])
  })

  it('does not resurrect a commit the user just deselected', () => {
    const { result: hook } = renderHook(() => useGitHistoryCommitSelection(result))
    act(() => void hook.current.handleRowClick(A, click({ toggle: true })))
    act(() => void hook.current.handleRowClick(A, click({ toggle: true })))
    act(() => void hook.current.handleRowClick(B, click({ toggle: true })))
    expect(selectedIds(hook)).toEqual(['b'])
  })

  it('Shift-click selects the range from the anchor', () => {
    const { result: hook } = renderHook(() => useGitHistoryCommitSelection(result))
    act(() => void hook.current.handleRowClick(A, click()))
    act(() => void hook.current.handleRowClick(C, click({ shiftKey: true })))
    expect(selectedIds(hook)).toEqual(['a', 'b', 'c'])
  })

  it('keeps selected commits that a reloaded result still lists, and drops the rest', () => {
    const { result: hook, rerender } = renderHook(
      ({ history }: { history: GitHistoryResult }) => useGitHistoryCommitSelection(history),
      { initialProps: { history: result } }
    )
    act(() => void hook.current.handleRowClick(A, click()))
    act(() => void hook.current.handleRowClick(C, click({ shiftKey: true })))
    expect(selectedIds(hook)).toEqual(['a', 'b', 'c'])

    rerender({ history: { ...result, items: [C, A] } })
    expect(selectedIds(hook)).toEqual(['c', 'a'])
  })
})
