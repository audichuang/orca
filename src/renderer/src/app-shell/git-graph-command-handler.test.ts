// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../store'
import { createAppCommandHandlers } from './app-command-handlers'
import { createGitGraphCommandHandler } from './git-graph-command-handler'

function seed(activeWorktreeId: string | null): void {
  useAppStore.setState({
    activeWorktreeId,
    repos: [
      { id: 'repo-1', path: '/repo', displayName: 'repo', badgeColor: '#000', addedAt: 0 },
      {
        id: 'notes',
        path: '/notes',
        displayName: 'notes',
        badgeColor: '#000',
        addedAt: 0,
        kind: 'folder'
      }
    ],
    worktreesByRepo: {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only reads id, repoId and path.
      'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: '/repo' } as never],
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler only reads id, repoId and path.
      notes: [{ id: 'wt-notes', repoId: 'notes', path: '/notes' } as never]
    }
  })
}

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('Open Git Graph shortcut', () => {
  it('is registered in the app command map', () => {
    seed('wt-1')
    const handlers = createAppCommandHandlers(
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only activeView is read on this path.
      { activeView: 'terminal' } as Parameters<typeof createAppCommandHandlers>[0]
    )
    expect(handlers.has('sourceControl.openGitGraph')).toBe(true)
  })

  it("claims the chord and opens the active workspace's tab", () => {
    seed('wt-1')
    const claim = vi.fn((_id: string, run: () => void) => {
      run()
      return true
    })
    const [, handler] = createGitGraphCommandHandler('terminal', claim)
    expect(handler()).toBe(true)
    expect(useAppStore.getState().openFiles).toContainEqual(
      expect.objectContaining({ id: 'wt-1::git-graph', mode: 'git-graph' })
    )
  })

  it('lets the chord through outside the workspace view or without a git repo', () => {
    const claim = vi.fn(() => true)
    seed('wt-1')
    expect(createGitGraphCommandHandler('settings', claim)[1]()).toBe(false)
    seed('wt-notes')
    expect(createGitGraphCommandHandler('terminal', claim)[1]()).toBe(false)
    seed(null)
    expect(createGitGraphCommandHandler('terminal', claim)[1]()).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })
})
