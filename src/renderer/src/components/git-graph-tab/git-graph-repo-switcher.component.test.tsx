// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, type RenderResult } from '@testing-library/react'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { GitGraphRepoSwitcher } from './git-graph-repo-switcher'
import type { GitGraphRepoChoice } from './git-graph-tab-model'

function choice(name: string, branch: string, folder = name): GitGraphRepoChoice {
  const repo: Repo = {
    id: `repo-${name}`,
    path: `/work/projects/${folder}`,
    displayName: name,
    badgeColor: '#000',
    addedAt: 0,
    kind: 'git'
  }
  const worktree: Worktree = {
    id: `wt-${name}`,
    repoId: repo.id,
    path: `/work/projects/${folder}`,
    head: 'abc',
    branch: `refs/heads/${branch}`,
    isBare: false,
    isMainWorktree: true,
    displayName: name,
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
  return { repo, worktree }
}

// Every path shares /work/projects/, which a subsequence matcher scores for any short query.
const CHOICES = [
  choice('core', 'main'),
  choice('api-server', 'release-candidate'),
  choice('docs-site', 'main')
]

const ADD_REPOS = {
  label: 'Add repositories...',
  missingLabel: null,
  hidden: false,
  onMenuOpen: vi.fn(),
  onSelect: vi.fn()
}

function switcher(choices: readonly GitGraphRepoChoice[]): React.JSX.Element {
  return (
    <GitGraphRepoSwitcher
      choices={choices}
      value="wt-core"
      onValueChange={vi.fn()}
      addRepos={ADD_REPOS}
    />
  )
}

function openSwitcher(choices: readonly GitGraphRepoChoice[] = CHOICES): RenderResult {
  const result = render(switcher(choices))
  fireEvent.click(screen.getByRole('combobox', { name: 'Repository' }))
  return result
}

function search(query: string): void {
  fireEvent.change(screen.getByPlaceholderText('Search repositories...'), {
    target: { value: query }
  })
}

const visibleRepoRows = (): string[] =>
  screen
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')
    .filter((text) => text !== 'Add repositories...')

afterEach(cleanup)

describe('GitGraphRepoSwitcher search', () => {
  it('keeps only repos whose name contains the query, plus the add entry', () => {
    openSwitcher()
    expect(visibleRepoRows()).toHaveLength(3)
    search('core')
    expect(visibleRepoRows()).toEqual([expect.stringContaining('core')])
    expect(screen.getByText('Add repositories...')).toBeInTheDocument()
  })

  it('matches on the branch name', () => {
    openSwitcher()
    search('release')
    expect(visibleRepoRows()).toEqual([expect.stringContaining('api-server')])
  })

  it('matches a path only when the query has a slash', () => {
    openSwitcher()
    search('projects')
    expect(screen.queryAllByRole('option').map((o) => o.textContent)).toEqual([
      'Add repositories...'
    ])
    search('projects/docs')
    expect(visibleRepoRows()).toEqual([expect.stringContaining('docs-site')])
  })

  it('ignores case', () => {
    openSwitcher()
    search('CORE')
    expect(visibleRepoRows()).toEqual([expect.stringContaining('core')])
    search('Release')
    expect(visibleRepoRows()).toEqual([expect.stringContaining('api-server')])
  })

  it('matches the folder name when the display name is a custom label', () => {
    openSwitcher([choice('core', 'main'), choice('Backend', 'main', 'api-server')])
    search('api-server')
    expect(visibleRepoRows()).toEqual([expect.stringContaining('Backend')])
  })

  it('matches a branch checked out while the list is open', () => {
    const { rerender } = openSwitcher()
    rerender(switcher([choice('core', 'hotfix-login'), ...CHOICES.slice(1)]))
    search('hotfix')
    expect(visibleRepoRows()).toEqual([expect.stringContaining('core')])
  })
})
