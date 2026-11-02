// Moved from open-file-apply.ts when the fork's git owner pushed it past max-lines; port upstream edits to this split here.
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AppState } from '../../../types'
import { emptySplitGroup, insertSplitGroup } from '../../tabs/tabs-group-actions'
import type { EditorLinkOpenPlacement } from '../tabs/editor-open-target-group'

export function linkSplitGroupState(
  s: AppState,
  worktreeId: string,
  linkPlacement: EditorLinkOpenPlacement | null
) {
  const splitGroup =
    linkPlacement?.kind === 'split' ? emptySplitGroup(worktreeId, createBrowserUuid()) : undefined
  const splitState =
    splitGroup && linkPlacement?.kind === 'split'
      ? insertSplitGroup(s, worktreeId, linkPlacement.split, splitGroup)
      : undefined
  return { splitGroup, splitState }
}
