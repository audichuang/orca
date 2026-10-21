// Fork-only: the Git Graph editor tab (one per workspace), modeled on check-run-details-actions.
import type { EditorGet, EditorSet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'
import type { OpenFile } from '../types/open-file'
import type { OpenGitGraphState } from '../../../../../../shared/editor-tab-view-types'
import { openWorkspaceEditorItem } from '../tabs/workspace-editor-item'
import { parseWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { rememberFolderRepo } from '@/components/right-sidebar/source-control/folder/folder-repo-selection'
import {
  dropGitGraphRevealRequestUnlessRepo,
  requestGitGraphReveal
} from '@/components/git-graph-tab/git-graph-reveal-request'
import { cancelGitGraphRepoFollow } from '@/components/git-graph-tab/git-graph-deferred-repo-follow'
import {
  GIT_GRAPH_TAB_LABEL,
  buildGitGraphTabId,
  listGitGraphRepoChoicesFromState,
  resolveGitGraphDefaultRepoWorktreeId
} from '@/components/git-graph-tab/git-graph-tab-model'

export function createGitGraphTabActions(
  set: EditorSet,
  get: EditorGet
): Pick<EditorSlice, 'openGitGraphTab' | 'setGitGraphTabRepo' | 'setGitGraphTabFilter'> {
  return {
    openGitGraphTab: (workspaceId, opts) => {
      const state = get()
      const id = buildGitGraphTabId(workspaceId)
      const existing = state.openFiles.find((file) => file.id === id && file.mode === 'git-graph')
      // Why validate: a remembered repo can be removed while the tab stays open; fall back instead of sticking.
      const choiceIds = new Set(
        listGitGraphRepoChoicesFromState(state, workspaceId).map((choice) => choice.worktree.id)
      )
      const repoWorktreeId =
        [opts?.repoWorktreeId, existing?.gitGraph?.repoWorktreeId].find(
          (candidate) => candidate !== undefined && choiceIds.has(candidate)
        ) ?? resolveGitGraphDefaultRepoWorktreeId(state, workspaceId)
      if (!repoWorktreeId) {
        return null
      }
      // Why: the tab and the folder's Source Control show one shared repo pick.
      if (parseWorkspaceKey(workspaceId)?.type === 'folder') {
        rememberFolderRepo(workspaceId, repoWorktreeId)
      }
      if (opts?.revealCommit) {
        requestGitGraphReveal(id, repoWorktreeId, opts.revealCommit)
      }
      set((s) => {
        const file: OpenFile = {
          ...s.openFiles.find((entry) => entry.id === id),
          id,
          filePath: id,
          relativePath: GIT_GRAPH_TAB_LABEL,
          worktreeId: workspaceId,
          language: 'plaintext',
          isDirty: false,
          // Why null: undefined lets a Cmd+Shift+T reopen adopt the active runtime and miss this tab.
          runtimeEnvironmentId: null,
          mode: 'git-graph',
          gitGraph: opts?.filter
            ? { repoWorktreeId, filter: opts.filter }
            : withGitGraphRepo(existing?.gitGraph, repoWorktreeId)
        }
        const present = s.openFiles.some((entry) => entry.id === id)
        return {
          openFiles: present
            ? s.openFiles.map((entry) => (entry.id === id ? file : entry))
            : [...s.openFiles, file],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [workspaceId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [workspaceId]: 'editor' }
        }
      })
      // Why: without an explicit target, focus the existing tab in its own group instead of duplicating it into the active one.
      const existingGroupId =
        opts?.targetGroupId ??
        (get().unifiedTabsByWorktree?.[workspaceId] ?? []).find(
          (tab) => tab.entityId === id && tab.contentType === 'git-graph'
        )?.groupId
      openWorkspaceEditorItem(
        get(),
        id,
        workspaceId,
        GIT_GRAPH_TAB_LABEL,
        'git-graph',
        false,
        existingGroupId
      )
      return id
    },

    setGitGraphTabRepo: (fileId, repoWorktreeId) => {
      const workspaceId = get().openFiles.find(
        (file) => file.id === fileId && file.mode === 'git-graph'
      )?.worktreeId
      // Why: a folder's graph and Source Control share one repo pick; the no-op guard there stops echoes.
      if (workspaceId && parseWorkspaceKey(workspaceId)?.type === 'folder') {
        rememberFolderRepo(workspaceId, repoWorktreeId)
        // Why: this switch is newer than a keyboard walk still waiting to move the tab.
        cancelGitGraphRepoFollow(workspaceId)
      }
      dropGitGraphRevealRequestUnlessRepo(fileId, repoWorktreeId)
      set((s) => {
        const target = s.openFiles.find((file) => file.id === fileId)
        if (target?.mode !== 'git-graph' || target.gitGraph?.repoWorktreeId === repoWorktreeId) {
          return s
        }
        return {
          openFiles: s.openFiles.map((file) =>
            file.id === fileId
              ? { ...file, gitGraph: withGitGraphRepo(file.gitGraph, repoWorktreeId) }
              : file
          )
        }
      })
    },

    setGitGraphTabFilter: (fileId, filter) => {
      set((s) => {
        const target = s.openFiles.find((file) => file.id === fileId)
        if (target?.mode !== 'git-graph' || !target.gitGraph) {
          return s
        }
        const { repoWorktreeId } = target.gitGraph
        return {
          openFiles: s.openFiles.map((file) =>
            file.id === fileId ? { ...file, gitGraph: { repoWorktreeId, filter } } : file
          )
        }
      })
    }
  }
}

/** Repo switch rule: scope, sources and search carry over; branch picks are per repo and drop. */
function withGitGraphRepo(
  previous: OpenGitGraphState | undefined,
  repoWorktreeId: string
): OpenGitGraphState {
  const filter = previous?.filter
  if (!filter || previous.repoWorktreeId === repoWorktreeId) {
    return { repoWorktreeId, ...(filter ? { filter } : {}) }
  }
  const scope = filter.scope === 'refs' ? 'all' : filter.scope
  return { repoWorktreeId, filter: { ...filter, scope, refs: [] } }
}
