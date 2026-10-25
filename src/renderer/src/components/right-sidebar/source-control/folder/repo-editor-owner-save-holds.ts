import {
  notifyEditorExternalFileChange,
  type EditorPathMutationTarget
} from '@/components/editor/editor-autosave'
import {
  releaseEditorSaveHolds,
  requestEditorSaveQuiesceAll
} from '@/components/editor/editor-save-quiesce-batch'
import { resolveTabOwners } from './worktree-scope'

/** Path targets, each naming the repo worktree that git mutates. */
type RepoTargets = EditorPathMutationTarget | EditorPathMutationTarget[]

// Why: a folder workspace's open tabs are owned by the folder key while git runs against the repo.
function forEditorOwners(
  editorWorktreeId: string | undefined,
  repoTargets: RepoTargets
): EditorPathMutationTarget[] {
  return (Array.isArray(repoTargets) ? repoTargets : [repoTargets]).flatMap((target) => {
    const { tabOwnerId, gitOwnerId } = resolveTabOwners(editorWorktreeId, target.worktreeId)
    const ownerIds = gitOwnerId ? [gitOwnerId, tabOwnerId] : [tabOwnerId]
    return ownerIds.map((worktreeId) => ({ ...target, worktreeId }))
  })
}

/** Holds autosave of each repo target in every editor showing it; all holds or none. */
export async function requestEditorSaveQuiesceForOwners(
  editorWorktreeId: string | undefined,
  repoTargets: RepoTargets
): Promise<() => void> {
  const releases = await requestEditorSaveQuiesceAll(forEditorOwners(editorWorktreeId, repoTargets))
  return () => releaseEditorSaveHolds(releases)
}

export function notifyEditorExternalFileChangeForOwners(
  editorWorktreeId: string | undefined,
  repoTargets: RepoTargets
): void {
  for (const target of forEditorOwners(editorWorktreeId, repoTargets)) {
    notifyEditorExternalFileChange(target)
  }
}
