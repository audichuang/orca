import { describe, expect, it, vi } from 'vitest'
import type { GitHistoryItem } from '../../../../../../shared/git-history'
import type { GitCommitCompareResult } from '../../../../../../shared/git-diff-compare-types'
import { getDiffFilePosition } from '../../../editor/diff-file-sequence'
import { commitDiffTabId } from '@/store/slices/editor/actions/open-history-diff'
import { openCommitFileInSequence, type CommitFileTarget } from './commit-file-sequence'

function commit(id: string): GitHistoryItem {
  return {
    id,
    displayId: id.slice(0, 7),
    parentIds: [],
    subject: `subject ${id}`,
    message: `message ${id}`
  }
}

function summary(id: string, parent: string): GitCommitCompareResult['summary'] {
  return {
    commitOid: id,
    parentOid: parent,
    compareRef: id.slice(0, 7),
    baseRef: parent.slice(0, 7),
    changedFiles: 1,
    status: 'ready'
  }
}

type OpenCommitDiff = Parameters<typeof openCommitFileInSequence>[0]['openCommitDiff']

describe('openCommitFileInSequence', () => {
  const newest = commit('cccccccccc')
  const oldest = commit('aaaaaaaaaa')
  const summaries = new Map([
    [newest.id, summary(newest.id, 'bbbbbbbbbb')],
    [oldest.id, summary(oldest.id, '0000000000')]
  ])
  const target = (path: string, head: GitHistoryItem, base = head): CommitFileTarget => ({
    entry: { path, status: 'modified' },
    head,
    base
  })
  // The diff tab openCommitDiff would create for one of its calls.
  const tabOf = ([worktreeId, , entry, compare, , options]: Parameters<OpenCommitDiff>) => {
    const compareVersion = `${compare.parentOid ?? 'empty-tree'}:${compare.commitOid}`
    return {
      id: commitDiffTabId(worktreeId, options?.gitWorktreeId, compareVersion, entry.path),
      mode: 'diff' as const,
      diffSource: 'commit' as const
    }
  }
  const openWith = (
    openCommitDiff: OpenCommitDiff,
    clicked: CommitFileTarget,
    sequence: CommitFileTarget[],
    targetGroupId?: string
  ): void =>
    openCommitFileInSequence({
      item: clicked.head,
      entry: clicked.entry,
      sequence,
      tabOwnerId: 'wt-1',
      gitWorktreeId: 'wt-1@repo',
      worktreePath: '/repo',
      summaryFor: (id) => summaries.get(id),
      openCommitDiff,
      targetGroupId,
      preview: false
    })

  it('diffs a merged row from before its oldest change and steps to the next row in preview', () => {
    const openCommitDiff = vi.fn<OpenCommitDiff>()
    const spanning = target('src/app.ts', newest, oldest)
    const single = target('src/other.ts', oldest)
    openWith(openCommitDiff, spanning, [spanning, single], 'group-split')

    expect(openCommitDiff).toHaveBeenCalledWith(
      'wt-1',
      '/repo',
      spanning.entry,
      expect.objectContaining({
        commitOid: newest.id,
        parentOid: '0000000000',
        subject: undefined
      }),
      expect.any(String),
      { targetGroupId: 'group-split', preview: false, gitWorktreeId: 'wt-1@repo' }
    )
    const position = getDiffFilePosition(tabOf(openCommitDiff.mock.calls[0]!), () => 'group-1')
    expect(position).toMatchObject({ index: 0, total: 2 })

    position!.open(1)
    expect(openCommitDiff).toHaveBeenLastCalledWith(
      'wt-1',
      '/repo',
      single.entry,
      expect.objectContaining({ commitOid: oldest.id, parentOid: '0000000000' }),
      expect.any(String),
      { targetGroupId: 'group-1', preview: true, gitWorktreeId: 'wt-1@repo' }
    )
    expect(getDiffFilePosition(tabOf(openCommitDiff.mock.calls[1]!))).toMatchObject({ index: 1 })
  })

  it('keeps stepping through its own list after another pane registers an overlapping one', () => {
    const openCommitDiff = vi.fn<OpenCommitDiff>()
    const sidebarList = [target('a.ts', newest), target('b.ts', newest)]
    openWith(openCommitDiff, sidebarList[0]!, sidebarList)
    const leftPane = getDiffFilePosition(tabOf(openCommitDiff.mock.calls[0]!))
    // The right pane opens a Graph selection that shares a.ts and b.ts with the sidebar list.
    const graphList = [...sidebarList, target('c.ts', oldest)]
    openWith(openCommitDiff, graphList[2]!, graphList)

    leftPane!.open(1)

    expect(getDiffFilePosition(tabOf(openCommitDiff.mock.calls.at(-1)!))).toMatchObject({
      index: 1,
      total: 2
    })
  })

  it('keeps a tab on its own list when another pane overlaps it, until the tab reopens from that list', () => {
    const openCommitDiff = vi.fn<OpenCommitDiff>()
    const sidebarList = [target('a.ts', newest), target('b.ts', newest)]
    openWith(openCommitDiff, sidebarList[0]!, sidebarList)
    const tabA = tabOf(openCommitDiff.mock.calls[0]!)
    expect(getDiffFilePosition(tabA, undefined, 'view-left')).toMatchObject({ total: 2 })
    const graphList = [...sidebarList, target('c.ts', oldest)]
    openWith(openCommitDiff, graphList[2]!, graphList)

    // Promoting the preview tab replaces its OpenFile object but not its id.
    expect(getDiffFilePosition({ ...tabA }, undefined, 'view-left')).toMatchObject({ total: 2 })

    openWith(openCommitDiff, graphList[0]!, graphList)
    expect(getDiffFilePosition(tabA, undefined, 'view-left')).toMatchObject({ total: 3 })
  })
})
