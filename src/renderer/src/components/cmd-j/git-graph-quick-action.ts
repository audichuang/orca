// Fork-only: Cmd+J entry for the Git Graph editor tab.
import { GitGraph } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { CmdJQuickAction } from './quick-actions'
import {
  getCurrentWorkspaceActionAvailability,
  type CmdJQuickActionAvailability,
  type CmdJQuickActionContext
} from './quick-action-context'

function availability(ctx: CmdJQuickActionContext): CmdJQuickActionAvailability {
  const workspace = getCurrentWorkspaceActionAvailability(ctx)
  if (!workspace.available) {
    return workspace
  }
  return ctx.canOpenGitGraph && ctx.openGitGraph
    ? { available: true }
    : { available: false, reason: 'no-git-repo' }
}

export function getGitGraphQuickActions(): CmdJQuickAction[] {
  return [
    {
      id: 'open-git-graph',
      kind: 'action',
      title: translate('auto.components.right.sidebar.GitGraphFullView.open', 'Open Git Graph'),
      description: translate(
        'auto.components.right.sidebar.GitGraphFullView.description',
        'Commit graph for the current repository.'
      ),
      icon: GitGraph,
      verbKeywords: [
        translate('auto.components.cmd.j.quick.actions.verbs.openGitGraph', 'open git graph'),
        translate('auto.components.cmd.j.quick.actions.verbs.gitLog', 'git log'),
        translate('auto.components.cmd.j.quick.actions.verbs.commitHistory', 'commit history')
      ],
      isAvailable: availability,
      run: async (ctx) => {
        const result = availability(ctx)
        if (!result.available) {
          return { status: 'unavailable', reason: result.reason }
        }
        ctx.openGitGraph?.()
        return { status: 'ok' }
      }
    }
  ]
}
