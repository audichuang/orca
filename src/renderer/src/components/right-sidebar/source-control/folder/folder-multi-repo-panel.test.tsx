// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'
import { setReposHiddenFromSidebar } from './folder-sidebar-hidden-repos'
import { useSourceControlWorktreeScope } from './worktree-scope'

// The repo panel is the regular single-repo panel; a stub shows which repo the accordion pinned it to.
vi.mock('../panel/single-repo-panel', () => ({
  SourceControlSingleRepoPanel: () => {
    const scope = useSourceControlWorktreeScope()
    return (
      <div data-testid="repo-panel" data-label={scope?.label} data-color={scope?.color}>
        {scope?.gitWorktreeId}
      </div>
    )
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

function renderPanel(changeCounts: Record<string, number>, names: readonly string[] = NAMES): void {
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
    repos: names.map(repo),
    worktreesByRepo: Object.fromEntries(names.map((name) => [`repo-${name}`, [worktree(name)]])),
    gitStatusByWorktree: Object.fromEntries(
      names.map((name) => [
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

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-repo-row]')]
const rowName = (row: HTMLElement) => row.querySelector('[data-repo-row-name]')?.textContent
const header = (name: string) => {
  const row = rows().find((candidate) => rowName(candidate) === name)
  if (!row) {
    throw new Error(`no repo row named ${name}`)
  }
  return row
}
const openRows = () => rows().filter((row) => row.getAttribute('aria-current') === 'true')
const openPanel = () => screen.queryByTestId('repo-panel')?.textContent ?? null
const groupToggle = (name: RegExp) => screen.getByRole('button', { name })
const MANY = ['api', 'core', 'docs', 'orders-api', 'orders-web', 'payments-api', 'web'] as const
const filterBox = () => screen.getByRole('textbox', { name: 'Filter repositories' })
const filterlessOutside = () => screen.getByRole('button', { name: 'Refresh all repositories' })
const setChanges = (name: string, count: number) =>
  act(() =>
    useAppStore.setState((s) => ({
      gitStatusByWorktree: {
        ...s.gitStatusByWorktree,
        [`wt-${name}`]: Array.from({ length: count }, (_, i) => ({
          path: `f${i}.ts`,
          status: 'modified' as const,
          area: 'unstaged' as const
        }))
      }
    }))
  )

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
})
afterEach(cleanup)

describe('FolderMultiRepoPanel accordion', () => {
  it('opens the first repo with changes and pins the repo panel to it', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    expect(header('core')).toHaveAttribute('aria-expanded', 'true')
    expect(header('web')).toHaveAttribute('aria-expanded', 'false')
    expect(openPanel()).toBe('wt-core')
  })

  it('opens one repo at a time and keeps the open repo open when its row is clicked again', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    fireEvent.click(header('web'))
    expect(openPanel()).toBe('wt-web')
    expect(openRows()).toHaveLength(1)
    fireEvent.click(header('web'))
    expect(openPanel()).toBe('wt-web')
    expect(header('web')).toHaveAttribute('aria-current', 'true')
  })

  it('selects the repo arrow keys land on and switches the pinned panel', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    header('api').focus()
    fireEvent.keyDown(header('api'), { key: 'ArrowDown' })
    expect(header('core')).toHaveFocus()
    expect(openPanel()).toBe('wt-core')
    expect(header('core')).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(header('core'), { key: 'End' })
    expect(header('web')).toHaveFocus()
    expect(openPanel()).toBe('wt-web')
    expect(header('web')).toHaveAttribute('tabindex', '0')
    expect(header('api')).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(header('web'), { key: 'Home' })
    expect(openPanel()).toBe('wt-api')
  })

  it('keeps focus on a row when it opens', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    header('web').focus()
    fireEvent.click(header('web'))
    expect(openPanel()).toBe('wt-web')
    expect(header('web')).toHaveFocus()
  })

  it('shows a change count only when the repo has changes', () => {
    renderPanel({ api: 3, core: 0, web: 12 })
    fireEvent.click(groupToggle(/^No changes/))
    expect(header('api')).toHaveTextContent(/3$/)
    expect(header('web')).toHaveTextContent(/12$/)
    expect(header('core').textContent).not.toMatch(/\d/)
  })

  it('gives the hover actions their own track before the change count instead of covering it', () => {
    renderPanel({ api: 10 })
    const row = header('api').parentElement!
    const actions = row.querySelector('[aria-label="Copy all changes"]')!.parentElement!
    const count = [...row.querySelectorAll('span')].find((span) => span.textContent === '10')!
    expect(header('api')).toHaveTextContent(/10$/)
    // No layout in happy-dom: the grid tracks are what keep the count clear of the actions.
    expect(actions).not.toHaveClass('absolute')
    expect(actions).toHaveClass('col-start-2')
    expect(count.parentElement).toHaveClass('col-start-3')
    // display:none would drop eye/copy out of the Tab order, so idle hides by width and opacity instead.
    expect(actions).not.toHaveClass('hidden')
  })

  it('shows the repo colour mark and the branch as its own column', () => {
    renderPanel({ api: 1 })
    const row = header('api')
    expect(row.querySelector('[aria-hidden="true"]')).toHaveStyle({ backgroundColor: '#000000' })
    expect(row).toHaveTextContent(/^api main/)
    expect(row.textContent).not.toContain('(main)')
  })

  it('lists repos in one scroller with the open repo panel pinned below it', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    fireEvent.click(header('core'))
    const list = document.querySelector('[data-folder-repo-list]')
    const detail = document.querySelector('[data-folder-repo-detail]')
    expect(list?.querySelectorAll('[data-repo-row]')).toHaveLength(3)
    expect(list?.nextElementSibling).toBe(detail)
    expect(detail).toContainElement(screen.getByTestId('repo-panel'))
    expect(screen.getByTestId('repo-panel')).toHaveAttribute('data-label', 'core')
  })
})

describe('FolderMultiRepoPanel groups', () => {
  it('lists repos with changes first and folds the clean ones under No changes', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    expect(groupToggle(/^Changes\s*2/)).toHaveAttribute('aria-expanded', 'true')
    expect(groupToggle(/^No changes\s*1/)).toHaveAttribute('aria-expanded', 'false')
    expect(rows().map(rowName)).toEqual(['core', 'web'])
    fireEvent.click(groupToggle(/^No changes/))
    expect(rows().map(rowName)).toEqual(['core', 'web', 'api'])
  })

  it('keeps the open repo visible even when its group is folded', () => {
    renderPanel({ api: 0, core: 0, web: 0 })
    expect(openPanel()).toBe('wt-api')
    expect(rows().map(rowName)).toEqual(['api'])
  })

  it('unfolds No changes when a status refresh cleans the open repo, keeping its row focused', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    expect(groupToggle(/^No changes\s*1/)).toHaveAttribute('aria-expanded', 'false')
    expect(openPanel()).toBe('wt-core')
    header('core').focus()
    setChanges('core', 0)
    expect(groupToggle(/^No changes\s*2/)).toHaveAttribute('aria-expanded', 'true')
    expect(openPanel()).toBe('wt-core')
    expect(header('core')).toHaveFocus()
  })

  it('keeps focus in the list when a focused closed row is cleaned away by a status refresh', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    header('web').focus()
    setChanges('web', 0)
    expect(rows().map(rowName)).toEqual(['core'])
    expect(document.activeElement).not.toBe(document.body)
    expect(header('core')).toHaveFocus()
  })

  it('does not pull focus back into the list when it was elsewhere', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    filterlessOutside().focus()
    setChanges('web', 0)
    expect(filterlessOutside()).toHaveFocus()
  })

  it('leaves focus where the user moved it when an unrelated re-render follows', () => {
    renderPanel({ api: 1, core: 1 })
    header('api').focus()
    act(() => {
      header('api').blur()
      setReposHiddenFromSidebar([useAppStore.getState().repos[0]], true)
    })
    expect(document.activeElement).toBe(document.body)
    act(() => setReposHiddenFromSidebar([useAppStore.getState().repos[0]], false))
    expect(document.activeElement).toBe(document.body)
  })

  it('does not pull focus back to a re-picked open row once the user moves on', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    fireEvent.click(header('web'))
    fireEvent.click(header('web'))
    filterlessOutside().focus()
    setChanges('api', 3)
    expect(filterlessOutside()).toHaveFocus()
  })

  // Enter/Space on a row button fire click, so this also covers the keyboard re-pick.
  it('does not pull focus back after re-picking an arrowed-to open row once the user moves on', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    header('api').focus()
    fireEvent.keyDown(header('api'), { key: 'ArrowDown' })
    fireEvent.click(header('core'))
    filterlessOutside().focus()
    setChanges('web', 4)
    expect(filterlessOutside()).toHaveFocus()
  })

  it('keeps focus on a picked match that moves once the filter clears', () => {
    renderPanel({ api: 1, 'orders-api': 0, web: 1 }, MANY)
    fireEvent.change(filterBox(), { target: { value: 'api' } })
    expect(rows().map(rowName)).toEqual(['api', 'orders-api', 'payments-api'])
    header('orders-api').focus()
    fireEvent.click(header('orders-api'))
    expect(rows().map(rowName).slice(0, 3)).toEqual(['api', 'web', 'core'])
    expect(groupToggle(/^No changes/)).toHaveAttribute('aria-expanded', 'true')
    expect(header('orders-api')).toHaveFocus()
  })

  it('moves the keyboard in drawn order and skips folded rows', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    header('core').focus()
    fireEvent.keyDown(header('core'), { key: 'End' })
    expect(header('web')).toHaveFocus()
    fireEvent.click(groupToggle(/^No changes/))
    header('web').focus()
    fireEvent.keyDown(header('web'), { key: 'ArrowDown' })
    expect(header('api')).toHaveFocus()
  })

  it('lists filter matches flat, across both groups', () => {
    renderPanel({ api: 1 }, MANY)
    fireEvent.change(filterBox(), { target: { value: 'api' } })
    expect(screen.queryByRole('button', { name: /^No changes/ })).toBeNull()
    expect(rows().map(rowName)).toEqual(['api', 'orders-api', 'payments-api'])
  })
})

describe('FolderMultiRepoPanel sync and hidden state', () => {
  const upstream = (ahead: number, behind = 0) => ({
    hasUpstream: true,
    upstreamName: 'origin/main',
    ahead,
    behind
  })

  it("names the open repo with its colour in the panel's own toolbar", () => {
    renderPanel({ core: 1 })
    const panel = screen.getByTestId('repo-panel')
    expect(panel).toHaveAttribute('data-label', 'core')
    expect(panel.getAttribute('data-color')).toMatch(/^(#|hsl)/)
  })

  it('lists a clean repo with commits to push under Changes with its count', () => {
    useAppStore.setState({ remoteStatusesByWorktree: { 'wt-web': upstream(2) } })
    renderPanel({ core: 1 })
    expect(groupToggle(/^Changes\s*2/)).toBeInTheDocument()
    expect(header('web')).toHaveTextContent(/↑2$/)
    expect(header('web').textContent).not.toMatch(/↑2\s*\d/)
  })

  it('marks a repo hidden from the sidebar without hovering', () => {
    renderPanel({ api: 1, core: 1 })
    expect(header('api').querySelector('[data-sidebar-hidden-marker]')).toBeNull()
    act(() => setReposHiddenFromSidebar([useAppStore.getState().repos[0]], true))
    expect(header('api').querySelector('[data-sidebar-hidden-marker]')).not.toBeNull()
    act(() => setReposHiddenFromSidebar([useAppStore.getState().repos[0]], false))
  })
})

describe('FolderMultiRepoPanel filter', () => {
  it('has no filter box for a short repo list', () => {
    renderPanel({ api: 1 })
    expect(screen.queryByRole('textbox', { name: 'Filter repositories' })).toBeNull()
  })

  it('folds the open repo away and lists only the matches right under the box', () => {
    renderPanel({ api: 1 }, MANY)
    expect(openPanel()).toBe('wt-api')
    fireEvent.change(filterBox(), { target: { value: 'orders' } })
    expect(openPanel()).toBeNull()
    expect(rows().map(rowName)).toEqual(['orders-api', 'orders-web'])
  })

  it('opens a clicked match and clears the filter', () => {
    renderPanel({ api: 1 }, MANY)
    fireEvent.change(filterBox(), { target: { value: 'api' } })
    fireEvent.click(header('api'))
    expect(openPanel()).toBe('wt-api')
    expect(filterBox()).toHaveValue('')
    expect(groupToggle(/^No changes\s*6/)).toBeInTheDocument()
  })

  it('opens the top match on Enter and clears on Escape', () => {
    renderPanel({}, MANY)
    fireEvent.change(filterBox(), { target: { value: 'payments' } })
    fireEvent.keyDown(filterBox(), { key: 'Enter' })
    expect(openPanel()).toBe('wt-payments-api')
    expect(filterBox()).toHaveValue('')
    fireEvent.change(filterBox(), { target: { value: 'web' } })
    fireEvent.keyDown(filterBox(), { key: 'Escape' })
    expect(filterBox()).toHaveValue('')
    expect(openPanel()).toBe('wt-payments-api')
  })

  it('moves focus from the box to the first match on ArrowDown', () => {
    renderPanel({}, MANY)
    fireEvent.change(filterBox(), { target: { value: 'orders' } })
    fireEvent.keyDown(filterBox(), { key: 'ArrowDown' })
    expect(header('orders-api')).toHaveFocus()
  })

  it('drops the query when the box hides, so it cannot narrow the list when it returns', () => {
    renderPanel({}, MANY)
    fireEvent.change(filterBox(), { target: { value: 'orders' } })
    const allRepos = useAppStore.getState().repos
    act(() => useAppStore.setState({ repos: allRepos.slice(0, 5) }))
    expect(screen.queryByRole('textbox', { name: 'Filter repositories' })).toBeNull()
    act(() => useAppStore.setState({ repos: allRepos }))
    expect(filterBox()).toHaveValue('')
    expect(groupToggle(/^No changes\s*7/)).toBeInTheDocument()
  })

  it('says so when nothing matches', () => {
    renderPanel({}, MANY)
    fireEvent.change(filterBox(), { target: { value: 'zzz' } })
    expect(screen.getByText('No repositories match')).toBeInTheDocument()
  })
})

describe('FolderMultiRepoPanel Git Graph button', () => {
  it('opens the graph on the repo currently open in the list', () => {
    const openGitGraphTab = vi.fn()
    useAppStore.setState({ openGitGraphTab })
    renderPanel({ api: 0, core: 2, web: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Open Git Graph' }))
    expect(openGitGraphTab).toHaveBeenCalledWith(expect.stringContaining('folder-'), {
      repoWorktreeId: 'wt-core'
    })
  })
})

describe('FolderMultiRepoPanel and the Git Graph tab', () => {
  const currentKey = () => folderWorkspaceKey(`folder-${folderCount}`)
  const gitGraphFiles = () =>
    useAppStore.getState().openFiles.filter((file) => file.mode === 'git-graph')

  it('selects the repo the Git Graph tab switched to', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    const id = useAppStore.getState().openGitGraphTab(currentKey())!
    act(() => useAppStore.getState().setGitGraphTabRepo(id, 'wt-web'))
    expect(openPanel()).toBe('wt-web')
    expect(header('web')).toHaveAttribute('aria-current', 'true')
  })

  it('switches an open Git Graph tab of the folder to the picked repo', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    const id = useAppStore.getState().openGitGraphTab(currentKey(), { repoWorktreeId: 'wt-api' })!
    fireEvent.click(header('web'))
    expect(useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph).toMatchObject(
      { repoWorktreeId: 'wt-web' }
    )
    vi.useFakeTimers()
    try {
      fireEvent.keyDown(header('web'), { key: 'Home' })
      act(() => vi.advanceTimersByTime(300))
    } finally {
      vi.useRealTimers()
    }
    expect(useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph).toMatchObject(
      { repoWorktreeId: 'wt-api' }
    )
  })

  it('moves the Git Graph tab once after a run of arrow keys, not per key', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    const id = useAppStore.getState().openGitGraphTab(currentKey(), { repoWorktreeId: 'wt-api' })!
    const tabRepo = () =>
      useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph?.repoWorktreeId
    const seen: (string | undefined)[] = []
    const unsubscribe = useAppStore.subscribe(() => {
      if (seen.at(-1) !== tabRepo()) {
        seen.push(tabRepo())
      }
    })
    vi.useFakeTimers()
    try {
      header('api').focus()
      fireEvent.keyDown(header('api'), { key: 'ArrowDown' })
      fireEvent.keyDown(header('core'), { key: 'ArrowDown' })
      fireEvent.keyDown(header('web'), { key: 'ArrowUp' })
      // The sidebar follows each key at once; the tab waits for the keys to stop.
      expect(openPanel()).toBe('wt-core')
      expect(tabRepo()).toBe('wt-api')
      act(() => vi.advanceTimersByTime(300))
      expect(tabRepo()).toBe('wt-core')
      expect(seen).toEqual(['wt-core'])

      // A click syncs at once and cancels a pending keyboard sync.
      fireEvent.keyDown(header('core'), { key: 'ArrowDown' })
      fireEvent.click(header('api'))
      expect(tabRepo()).toBe('wt-api')
      act(() => vi.advanceTimersByTime(300))
      expect(tabRepo()).toBe('wt-api')
    } finally {
      vi.useRealTimers()
      unsubscribe()
    }
  })

  it('shares its landing repo with a Git Graph tab opened afterwards', () => {
    renderPanel({ api: 0, core: 2, web: 1 })
    expect(openPanel()).toBe('wt-core')
    const id = useAppStore.getState().openGitGraphTab(currentKey())!
    expect(useAppStore.getState().openFiles.find((file) => file.id === id)?.gitGraph).toMatchObject(
      { repoWorktreeId: 'wt-core' }
    )
  })

  it('does not open a Git Graph tab when none is open', () => {
    renderPanel({ api: 1, core: 1, web: 1 })
    fireEvent.click(header('web'))
    expect(gitGraphFiles()).toEqual([])
  })
})
