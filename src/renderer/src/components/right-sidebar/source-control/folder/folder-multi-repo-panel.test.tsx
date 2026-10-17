// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { useSourceControlWorktreeScope } from './worktree-scope'

// The repo panel is the regular single-repo panel; a stub shows which repo the accordion pinned it to.
vi.mock('../panel/single-repo-panel', () => ({
  SourceControlSingleRepoPanel: () => {
    const scope = useSourceControlWorktreeScope()
    return <div data-testid="repo-panel">{scope?.gitWorktreeId}</div>
  }
}))
vi.mock('./use-folder-repo-status-refresh', () => ({
  useFolderRepoStatusRefresh: () => async () => {}
}))

const { FolderMultiRepoPanel } = await import('./folder-multi-repo-panel')

const NAMES = ['api', 'core', 'web'] as const

function repo(name: string): Repo {
  return {
    id: `repo-${name}`,
    path: `/work/${name}`,
    displayName: name,
    badgeColor: '#000',
    addedAt: 0,
    kind: 'git'
  }
}

function worktree(name: string): Worktree {
  return {
    id: `wt-${name}`,
    repoId: `repo-${name}`,
    path: `/work/${name}`,
    head: 'abc',
    branch: 'refs/heads/main',
    isBare: false,
    isMainWorktree: true,
    displayName: 'main',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0
  }
}

// A fresh folder id per render, so the module-level remembered pick cannot leak between tests.
let folderCount = 0

function renderPanel(changeCounts: Record<string, number>): void {
  folderCount += 1
  const folderId = `folder-${folderCount}`
  useAppStore.setState({
    folderWorkspaces: [
      {
        id: folderId,
        projectGroupId: 'group-1',
        name: 'work',
        folderPath: '/work',
        connectionId: null,
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    repos: NAMES.map(repo),
    worktreesByRepo: Object.fromEntries(NAMES.map((name) => [`repo-${name}`, [worktree(name)]])),
    gitStatusByWorktree: Object.fromEntries(
      NAMES.map((name) => [
        `wt-${name}`,
        Array.from({ length: changeCounts[name] ?? 0 }, (_, i) => ({
          path: `f${i}.ts`,
          status: 'modified' as const,
          area: 'unstaged' as const
        }))
      ])
    )
  })
  render(
    <TooltipProvider>
      <FolderMultiRepoPanel folderWorkspaceKey={folderWorkspaceKey(folderId)} />
    </TooltipProvider>
  )
}

const header = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} `) })
const openPanel = () => screen.queryByTestId('repo-panel')?.textContent ?? null

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})
afterEach(cleanup)

describe('FolderMultiRepoPanel accordion', () => {
  it('opens the first repo with changes and pins the repo panel to it', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    expect(header('core')).toHaveAttribute('aria-expanded', 'true')
    expect(header('api')).toHaveAttribute('aria-expanded', 'false')
    expect(openPanel()).toBe('wt-core')
  })

  it('opens one repo at a time and collapses all when the open header is clicked', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    fireEvent.click(header('web'))
    expect(openPanel()).toBe('wt-web')
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1)
    fireEvent.click(header('web'))
    expect(openPanel()).toBeNull()
    expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0)
    fireEvent.click(header('web'))
    expect(openPanel()).toBe('wt-web')
  })

  it('moves focus with arrow keys without opening, and Enter opens the focused repo', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    header('api').focus()
    fireEvent.keyDown(header('api'), { key: 'ArrowDown' })
    expect(header('core')).toHaveFocus()
    expect(openPanel()).toBe('wt-api')
    fireEvent.keyDown(header('core'), { key: 'End' })
    expect(header('web')).toHaveFocus()
    expect(header('web')).toHaveAttribute('tabindex', '0')
    expect(header('api')).toHaveAttribute('tabindex', '-1')
  })

  it('keeps focus on a header that moves to the other side of the open panel', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    // web sits below the open api panel; opening it moves its header above the panel.
    header('web').focus()
    fireEvent.click(header('web'))
    expect(openPanel()).toBe('wt-web')
    expect(header('web')).toHaveFocus()
  })

  it('shows each repo change count on its header', () => {
    renderPanel({ api: 3, core: 0, web: 12 })
    expect(header('api')).toHaveTextContent('3')
    expect(header('web')).toHaveTextContent('12')
  })
})
