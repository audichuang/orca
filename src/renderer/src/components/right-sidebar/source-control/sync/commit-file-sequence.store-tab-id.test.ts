import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from '@/store/slices/editor/editor-slice-test-harness'
import { getDiffFilePosition } from '../../../editor/diff-file-sequence'
import { openCommitFileInSequence, type CommitFileTarget } from './commit-file-sequence'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const HEAD = {
  id: 'c'.repeat(40),
  displayId: 'ccccccc',
  parentIds: ['p'.repeat(40)],
  subject: 'subject',
  message: 'message'
}

describe('openCommitFileInSequence with the real openCommitDiff', () => {
  // Why: the sequence mirrors upstream's commit diff tab id; a drift strands the change arrows.
  it('registers its steps under the tab id upstream opens', () => {
    const store = createEditorTabsStore()
    const sequence: CommitFileTarget[] = ['a.ts', 'b.ts'].map((path) => ({
      entry: { path, status: 'modified' },
      head: HEAD,
      base: HEAD
    }))
    openCommitFileInSequence({
      item: HEAD,
      entry: sequence[1]!.entry,
      sequence,
      worktreeId: 'wt-1',
      ownerOptions: {},
      worktreePath: '/repo',
      summaryFor: () => ({
        commitOid: HEAD.id,
        parentOid: 'p'.repeat(40),
        compareRef: 'ccccccc',
        baseRef: 'ppppppp',
        changedFiles: 2,
        status: 'ready'
      }),
      openCommitDiff: store.getState().openCommitDiff,
      targetGroupId: undefined,
      preview: false
    })

    const opened = store.getState().openFiles.find((file) => file.mode === 'diff')
    expect(opened?.id).toBe(`wt-1::diff::commit::${'p'.repeat(40)}:${HEAD.id}::b.ts`)
    expect(getDiffFilePosition(opened ?? null)).toMatchObject({ index: 1, total: 2 })
  })
})
