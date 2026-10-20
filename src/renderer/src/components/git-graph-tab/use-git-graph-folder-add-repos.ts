// Fork-only: lets a folder's Git Graph tab reach the repos under it that Orca has not added yet.
import { useCallback, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { NestedRepoCandidate } from '../../../../shared/project-group-types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  FOLDER_NESTED_REPO_SCAN_OPTIONS,
  getNewNestedRepoCandidatesFromState
} from '../right-sidebar/source-control/folder/folder-nested-repo-candidates'

type Scanned = { folderPath: string; repos: NestedRepoCandidate[]; partial: boolean }

export type GitGraphFolderAddRepos = {
  folderWorkspace: FolderWorkspace
  label: string
  /** Not-added count once the scan lands, null before then. */
  missingLabel: string | null
  /** True once a finished scan found nothing left to add. */
  allAdded: boolean
  /** Scans the folder once; called when the repo menu opens so the tab mount stays cheap. */
  scan: () => void
}

/** Null unless the workspace is a local folder: the add path is local only, like Source Control's. */
export function useGitGraphFolderAddRepos(workspaceId: string): GitGraphFolderAddRepos | null {
  const scope = parseWorkspaceKey(workspaceId)
  const folderWorkspaceId = scope?.type === 'folder' ? scope.folderWorkspaceId : null
  const folderWorkspace = useAppStore(
    (s) => s.folderWorkspaces.find((workspace) => workspace.id === folderWorkspaceId) ?? null
  )
  const local =
    folderWorkspace !== null && getRepoExecutionHostId(folderWorkspace) === LOCAL_EXECUTION_HOST_ID
  const [scanned, setScanned] = useState<Scanned | null>(null)
  const startedFor = useRef<string | null>(null)
  const folderPath = folderWorkspace?.folderPath ?? null
  const scan = useCallback(() => {
    if (!local || folderPath === null || startedFor.current === folderPath) {
      return
    }
    startedFor.current = folderPath
    window.api.projectGroups
      .scanNested({ path: folderPath, options: FOLDER_NESTED_REPO_SCAN_OPTIONS })
      .then((result) =>
        setScanned({
          folderPath,
          repos: result.repos,
          partial: result.truncated || result.timedOut
        })
      )
      .catch(() => {
        // Why: the entry still opens the dialog, which rescans and reports the failure itself.
      })
  }, [folderPath, local])
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const detectedWorktreesByRepo = useAppStore((s) => s.detectedWorktreesByRepo)
  // Why derived from the live store: repos added through the dialog drop out without a rescan.
  const missing = useMemo(
    () =>
      folderWorkspace && scanned?.folderPath === folderWorkspace.folderPath
        ? getNewNestedRepoCandidatesFromState(
            { repos, worktreesByRepo, detectedWorktreesByRepo },
            folderWorkspace,
            scanned.repos
          ).length
        : null,
    [detectedWorktreesByRepo, folderWorkspace, repos, scanned, worktreesByRepo]
  )
  if (!local || !folderWorkspace) {
    return null
  }
  const missingLabel =
    missing !== null && missing > 0
      ? translate('auto.components.gitGraphTab.addReposMissing', '{{value0}} not added', {
          value0: scanned?.partial ? `${missing}+` : missing
        })
      : null
  return {
    folderWorkspace,
    label: translate('auto.components.gitGraphTab.addRepos', 'Add repositories...'),
    missingLabel,
    allAdded: missing === 0 && !scanned?.partial,
    scan
  }
}
