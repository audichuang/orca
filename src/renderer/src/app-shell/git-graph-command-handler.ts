// Fork-only: the Open Git Graph shortcut, kept out of app-command-handlers.ts for its max-lines budget.
import { useAppStore } from '../store'
import type { AppState } from '../store/types'
import type { KeybindingActionId } from '../../../shared/keybindings'
import { resolveGitGraphDefaultRepoWorktreeId } from '../components/git-graph-tab/git-graph-tab-model'

export function createGitGraphCommandHandler(
  activeView: AppState['activeView'],
  claim: (actionId: KeybindingActionId, run: () => void) => boolean
): [KeybindingActionId, () => boolean] {
  return [
    'sourceControl.openGitGraph',
    () => {
      const store = useAppStore.getState()
      const workspaceId = store.activeWorktreeId
      // Why: editor tabs only show in the workspace view; elsewhere the chord would open an unseen tab.
      if (
        activeView !== 'terminal' ||
        !workspaceId ||
        !resolveGitGraphDefaultRepoWorktreeId(store, workspaceId)
      ) {
        return false
      }
      return claim('sourceControl.openGitGraph', () => store.openGitGraphTab(workspaceId))
    }
  ]
}
