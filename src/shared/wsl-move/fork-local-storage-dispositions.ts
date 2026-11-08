import { notApplicableDisposition, type WslMoveFieldDisposition } from './wsl-move-dispositions'

// Fork-only localStorage modules, kept here so the upstream census file stays within max-lines.
export const FORK_LOCAL_STORAGE_MODULE_DISPOSITIONS: Record<string, WslMoveFieldDisposition> = {
  // The Git Graph full view details pane width and collapse.
  'src/renderer/src/components/right-sidebar/source-control/sync/git-graph-full-view-details.tsx':
    notApplicableDisposition(62, 'Global preference or web-client storage.'),
  // The Git Graph list's shown columns and row density.
  'src/renderer/src/components/right-sidebar/source-control/sync/git-graph-list-prefs.ts':
    notApplicableDisposition(62, 'Global preference or web-client storage.')
}
