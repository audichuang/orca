import type { TabContentType } from '../../../shared/tab-types'
import type { WorkspaceTabContentType } from './workspace-tab-palette-search'
import { isForkEditorTabKind } from '../../../shared/fork-editor-tab-kinds'

export function isWorkspaceTabContentType(
  contentType: TabContentType
): contentType is WorkspaceTabContentType {
  if (isForkEditorTabKind(contentType)) {
    return true
  }
  return ['terminal', 'editor', 'diff', 'conflict-review', 'check-details'].includes(contentType)
}
