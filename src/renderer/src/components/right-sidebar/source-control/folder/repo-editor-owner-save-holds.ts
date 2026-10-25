import {
  notifyEditorExternalFileChange,
  type EditorPathMutationTarget
} from '@/components/editor/editor-autosave'
import {
  releaseEditorSaveHolds,
  requestEditorSaveQuiesceAll
} from '@/components/editor/editor-save-quiesce-batch'
import { resolveTabOwners } from './worktree-scope'

/** Path targets naming the repo worktree that git mutates. */
type RepoTargets = EditorPathMutationTarget | EditorPathMutationTarget[]

// Why: a folder workspace's open tabs are owned by the folder key while git runs against the repo.
function forEditorOwners(
  editorWorktreeId: string | undefined,
  repoTargets: RepoTargets
): EditorPathMutationTarget[] {
  const targets = Array.isArray(repoTargets) ? repoTargets : [repoTargets]
  const repoWorktreeId = targets[0]?.worktreeId
  if (!repoWorktreeId) {
    return targets
  }
  const { tabOwnerId, gitOwnerId } = resolveTabOwners(editorWorktreeId, repoWorktreeId)
  const ownerIds = gitOwnerId ? [gitOwnerId, tabOwnerId] : [tabOwnerId]
  return ownerIds.flatMap((worktreeId) => targets.map((target) => ({ ...target, worktreeId })))
}

/** Holds autosave of the repo's targets in every editor showing them; all holds or none. */
export async function requestEditorSaveQuiesceForOwners(
  editorWorktreeId: string | undefined,
  targets: RepoTargets
): Promise<() => void> {
  const releases = await requestEditorSaveQuiesceAll(forEditorOwners(editorWorktreeId, targets))
  return () => releaseEditorSaveHolds(releases)
}

export function notifyEditorExternalFileChangeForOwners(
  editorWorktreeId: string | undefined,
  targets: RepoTargets
): void {
  for (const target of forEditorOwners(editorWorktreeId, targets)) {
    notifyEditorExternalFileChange(target)
  }
}
