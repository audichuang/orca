// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import {
  ORCA_EDITOR_FILE_SAVED_EVENT,
  type EditorFileSavedDetail
} from '../../../editor/editor-autosave'
import { useFolderRepoStatusRefresh } from './use-folder-repo-status-refresh'

// No mocks of git-status-refresh / owner-target / connection-context: only the IPC edge is stubbed,
// so upstream changes to refresh admission, owner routing or status storage redden this file.
const repo = (name: string): Repo => ({
  id: `repo-${name}`,
  path: `/work/${name}`,
  displayName: name,
  badgeColor: '#000',
  addedAt: 0,
  kind: 'git'
})
function wt(name: string): Worktree {
  const fields = {
    id: `repo-${name}::/work/${name}`,
    repoId: `repo-${name}`,
    path: `/work/${name}`,
    isMainWorktree: true
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the hook reads id, repoId, path, pushTarget.
  return fields as Worktree
}

const status = vi.fn(async (args: { worktreePath: string }) => ({
  entries: [
    { path: `${args.worktreePath.split('/').pop()}.ts`, status: 'modified', area: 'unstaged' }
  ],
  conflictOperation: 'unknown'
}))

beforeEach(() => {
  status.mockClear()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    repos: [repo('api'), repo('core')],
    worktreesByRepo: { 'repo-api': [wt('api')], 'repo-core': [wt('core')] }
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only git.status/upstream reads are reached.
  ;(window as unknown as { api: unknown }).api = {
    git: {
      status,
      upstreamStatus: vi.fn(async () => ({ hasUpstream: false, ahead: 0, behind: 0 }))
    },
    worktrees: {}
  }
})
afterEach(() => vi.useRealTimers())

describe('useFolderRepoStatusRefresh against the real store', () => {
  it('fills gitStatusByWorktree for every member repo, not only the active worktree', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    let trigger: () => Promise<void> = async () => undefined
    function Harness(): null {
      trigger = useFolderRepoStatusRefresh([wt('api'), wt('core')], false)
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(React.createElement(Harness)))
    await act(async () => trigger())
    expect(status.mock.calls.map(([args]) => args.worktreePath)).toEqual([
      '/work/api',
      '/work/core'
    ])
    const byWorktree = useAppStore.getState().gitStatusByWorktree
    expect(byWorktree['repo-api::/work/api']?.map((e) => e.path)).toEqual(['api.ts'])
    expect(byWorktree['repo-core::/work/core']?.map((e) => e.path)).toEqual(['core.ts'])
    await act(async () => root.unmount())
  })

  it('refreshes the repo a save landed in after every view of the file closed', async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()
    function Harness(): null {
      useFolderRepoStatusRefresh([wt('api'), wt('core')], true)
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(React.createElement(Harness)))
    status.mockClear()
    const detail: EditorFileSavedDetail = {
      fileId: 'closed-view',
      content: 'x',
      filePath: '/work/core/src/x.ts'
    }
    await act(async () => {
      window.dispatchEvent(new CustomEvent(ORCA_EDITOR_FILE_SAVED_EVENT, { detail }))
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(status.mock.calls.map(([args]) => args.worktreePath)).toEqual(['/work/core'])
    await act(async () => root.unmount())
  })
})
