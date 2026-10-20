// Fork-only: where an Alt-click / "Open to the Side" from the Git Graph tab opens its diff.
import type { AppState } from '@/store/types'
import { findReusableRightSplitGroupId } from '@/lib/emulator-right-split-target'
import {
  isSourceControlSplitOpenModifier,
  type SourceControlRowOpenEvent
} from '../right-sidebar/source-control/listing/split-open'

type GitGraphSplitTargetState = Pick<
  AppState,
  'unifiedTabsByWorktree' | 'layoutByWorktree' | 'createEmptySplitGroup'
>

/**
 * Beside the graph tab's own group, not the active one: after one split-open focus sits in the
 * diff's group, and the next Alt-click must still land next to the graph instead of splitting again.
 */
export function resolveGitGraphSplitTargetGroupId(
  state: GitGraphSplitTargetState,
  workspaceId: string,
  graphFileId: string,
  event?: SourceControlRowOpenEvent
): string | undefined {
  if (!event || !isSourceControlSplitOpenModifier(event)) {
    return undefined
  }
  const graphGroupId = (state.unifiedTabsByWorktree[workspaceId] ?? []).find(
    (tab) => tab.entityId === graphFileId && tab.contentType === 'git-graph'
  )?.groupId
  if (!graphGroupId) {
    return undefined
  }
  return (
    findReusableRightSplitGroupId(state.layoutByWorktree[workspaceId], graphGroupId) ??
    state.createEmptySplitGroup(workspaceId, graphGroupId, 'right') ??
    undefined
  )
}
