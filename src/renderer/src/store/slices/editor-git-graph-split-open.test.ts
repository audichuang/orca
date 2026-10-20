import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from './editor-slice-test-harness'
import { resolveGitGraphSplitTargetGroupId } from '@/components/git-graph-tab/git-graph-split-target'
import {
  SOURCE_CONTROL_OPEN_TO_SIDE_EVENT,
  toSourceControlRowOpenEvent,
  type SourceControlRowOpenEvent
} from '@/components/right-sidebar/source-control/listing/split-open'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const WS = 'wt-1'
const ALT_CLICK = toSourceControlRowOpenEvent({
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false
})
const PLAIN_CLICK = { ...ALT_CLICK, altKey: false }

function openCommitFileDiff(
  store: ReturnType<typeof createEditorTabsStore>,
  path: string,
  targetGroupId: string | undefined
): void {
  store.getState().openCommitDiff(
    WS,
    '/repo',
    { path, status: 'modified' },
    {
      commitOid: 'c'.repeat(40),
      parentOid: 'p'.repeat(40),
      compareRef: 'c'.repeat(40),
      baseRef: 'p'.repeat(40),
      subject: 'subject',
      message: 'message'
    },
    'typescript',
    { targetGroupId, preview: !targetGroupId }
  )
}

function setup() {
  const store = createEditorTabsStore()
  const graphFileId = store.getState().openGitGraphTab(WS)
  if (!graphFileId) {
    throw new Error('Git Graph tab did not open')
  }
  const graphTab = () =>
    (store.getState().unifiedTabsByWorktree[WS] ?? []).find(
      (tab) => tab.contentType === 'git-graph'
    )
  const groupOf = (groupId: string | undefined) =>
    store.getState().groupsByWorktree[WS]?.find((group) => group.id === groupId)
  const resolve = (event: SourceControlRowOpenEvent | undefined) =>
    resolveGitGraphSplitTargetGroupId(store.getState(), WS, graphFileId, event)
  return { store, graphTab, groupOf, resolve }
}

describe('Git Graph tab: open a commit file diff beside the graph', () => {
  it('opens the diff in a split right of the graph and keeps the graph showing', () => {
    const { store, graphTab, groupOf, resolve } = setup()
    const graphGroupId = graphTab()?.groupId

    const target = resolve(ALT_CLICK)
    expect(target).toBeDefined()
    expect(target).not.toBe(graphGroupId)
    openCommitFileDiff(store, 'src/a.ts', target)

    const diffTab = (store.getState().unifiedTabsByWorktree[WS] ?? []).find(
      (tab) => tab.contentType === 'diff'
    )
    expect(diffTab?.groupId).toBe(target)
    expect(graphTab()?.groupId).toBe(graphGroupId)
    expect(groupOf(graphGroupId)?.activeTabId).toBe(graphTab()?.id)
    expect(store.getState().layoutByWorktree[WS]).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', groupId: graphGroupId },
      second: { type: 'leaf', groupId: target }
    })
  })

  it('reuses the right group for the next split-open instead of splitting again', () => {
    const { store, resolve } = setup()
    const first = resolve(SOURCE_CONTROL_OPEN_TO_SIDE_EVENT)
    openCommitFileDiff(store, 'src/a.ts', first)

    // Focus now sits in the diff's group; the target must still be beside the graph.
    expect(store.getState().activeGroupIdByWorktree[WS]).toBe(first)
    expect(resolve(ALT_CLICK)).toBe(first)
    expect(store.getState().groupsByWorktree[WS]).toHaveLength(2)
  })

  it('keeps a plain click in the graph group', () => {
    const { store, resolve } = setup()
    expect(resolve(PLAIN_CLICK)).toBeUndefined()
    expect(resolve(undefined)).toBeUndefined()
    expect(store.getState().groupsByWorktree[WS]).toHaveLength(1)
  })
})
