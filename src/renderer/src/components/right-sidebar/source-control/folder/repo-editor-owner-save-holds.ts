import {
  notifyEditorExternalFileChange,
  type EditorPathMutationTarget
} from '@/components/editor/editor-autosave'
import {
  releaseEditorSaveHolds,
  requestEditorSaveQuiesceAll
} from '@/components/editor/editor-save-quiesce-batch'
import { resolveTabOwners } from './worktree-scope'

// Why: a folder workspace's open tabs are owned by the folder key while git runs against the repo.
function forEditorOwners(
  editorWorktreeId: string | undefined,
  repoTargets: EditorPathMutationTarget[]
): EditorPathMutationTarget[] {
  return repoTargets.flatMap((target) => {
    const { tabOwnerId, gitOwnerId } = resolveTabOwners(editorWorktreeId, target.worktreeId)
    const ownerIds = gitOwnerId ? [gitOwnerId, tabOwnerId] : [tabOwnerId]
    return ownerIds.map((worktreeId) => ({ ...target, worktreeId }))
  })
}

/** Holds autosave of each repo target in every editor showing it; all holds or none. */
export async function requestEditorSaveQuiesceForOwners(
  editorWorktreeId: string | undefined,
  repoTargets: EditorPathMutationTarget[]
): Promise<() => void> {
  const releases = await requestEditorSaveQuiesceAll(forEditorOwners(editorWorktreeId, repoTargets))
  return () => releaseEditorSaveHolds(releases)
}

export function notifyEditorExternalFileChangeForOwners(
  editorWorktreeId: string | undefined,
  repoTargets: EditorPathMutationTarget[]
): void {
  for (const target of forEditorOwners(editorWorktreeId, repoTargets)) {
    notifyEditorExternalFileChange(target)
  }
}
