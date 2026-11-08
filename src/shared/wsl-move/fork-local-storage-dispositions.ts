import { notApplicableDisposition, type WslMoveFieldDisposition } from './wsl-move-dispositions'

// Fork-only localStorage modules, kept here so the upstream census file stays within max-lines.
export const FORK_LOCAL_STORAGE_MODULE_DISPOSITIONS: Record<string, WslMoveFieldDisposition> = {
  // The folder Source Control's hidden-repo picks.
  'src/renderer/src/components/right-sidebar/source-control/folder/folder-sidebar-hidden-repos.ts':
    notApplicableDisposition(62, 'Keyed by host and repo path; a moved repo shows again.')
}
