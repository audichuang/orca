import { cleanup } from '@testing-library/react'
import { useMemo, type ReactNode } from 'react'
import { vi } from 'vitest'
import { useAppStore } from '@/store'
import { makeFolderWorkspace, makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import { clearHostAgentMenuSettingsForTests } from '@/components/settings/use-host-agent-launch-preferences'
import { settleAgentLaunchPaneStart } from '@/lib/agent-launch-pane-start'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { saveSessionCommitErrors, saveSessionRemoteActionErrors } from './operation-error-session'
import { getDefaultSettings } from '../../../../../../shared/constants'
import { SourceControlWorktreeScopeContext } from '../folder/worktree-scope'

export const FOLDER = 'folder:folder'
export const OTHER_FOLDER = 'folder:other-folder'
export const REPO = {
  id: 'repo-a',
  path: '/work/folder/repo-a',
  displayName: 'repo-a',
  badgeColor: '#000',
  addedAt: 0
}
export const WORKTREE = makeWorktree({
  id: 'repo-a::/work/folder/repo-a',
  repoId: REPO.id,
  path: REPO.path,
  hostId: 'local'
})

export function resetFolderSourceControl() {
  saveSessionCommitErrors({})
  saveSessionRemoteActionErrors({})
  useAppStore.setState(useAppStore.getInitialState(), true)
  const settings = getDefaultSettings('/tmp')
  settings.experimentalNativeChat = false
  settings.sourceControlAi!.actions = {
    fixCommitFailure: { agentId: 'codex' },
    fixPushFailure: { agentId: 'codex' },
    resolveConflicts: { agentId: 'codex' }
  }
  useAppStore.setState({
    settings,
    activeWorktreeId: FOLDER,
    repos: [REPO],
    worktreesByRepo: { [REPO.id]: [WORKTREE] },
    folderWorkspaces: [
      makeFolderWorkspace({ id: 'folder', folderPath: '/work/folder' }),
      makeFolderWorkspace({ id: 'other-folder', folderPath: '/work' })
    ],
    localDetectedAgentIdsByContext: { host: ['codex'] }
  })
  setLocalRuntimeCapabilitiesForTests([])
  const api = {
    preflight: { detectAgents: vi.fn(async () => ['codex']) },
    git: {
      mutationInFlight: vi.fn(async () => ({ inFlight: false })),
      stage: vi.fn(async () => {}),
      discard: vi.fn(async () => {}),
      bulkDiscard: vi.fn(async () => {}),
      status: vi.fn(async () => ({ entries: [], head: 'abc123' })),
      conflictOperation: vi.fn(async () => 'none'),
      upstreamStatus: vi.fn(async () => null)
    },
    app: { platform: 'linux' }
  }
  vi.stubGlobal('api', api)
  return api
}

export function FolderScope({
  children,
  editorWorktreeId = FOLDER
}: {
  children: ReactNode
  editorWorktreeId?: string
}) {
  const scope = useMemo(
    () => ({ gitWorktreeId: WORKTREE.id, editorWorktreeId, label: 'repo-a' }),
    [editorWorktreeId]
  )
  return (
    <ConfirmationDialogProvider>
      <TooltipProvider>
        <SourceControlWorktreeScopeContext.Provider value={scope}>
          {children}
        </SourceControlWorktreeScopeContext.Provider>
      </TooltipProvider>
    </ConfirmationDialogProvider>
  )
}

export function cleanupFolderSourceControl() {
  cleanup()
  const state = useAppStore.getState()
  for (const tabs of Object.values(state.tabsByWorktree)) {
    for (const tab of tabs) {
      settleAgentLaunchPaneStart(tab.id, tab.agentLaunchPane?.leafId, null)
    }
  }
  clearHostAgentMenuSettingsForTests()
  setLocalRuntimeCapabilitiesForTests(null)
  vi.unstubAllGlobals()
}
