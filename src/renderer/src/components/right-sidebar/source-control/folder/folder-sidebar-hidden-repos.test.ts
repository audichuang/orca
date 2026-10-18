// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import {
  getSidebarHiddenRepoIds,
  isRepoHiddenFromSidebar,
  resetFolderSidebarHiddenReposForTest,
  setReposHiddenFromSidebar,
  subscribeFolderSidebarHiddenRepos
} from './folder-sidebar-hidden-repos'

function repo(id: string, path: string, extra: Partial<Repo> = {}): Repo {
  return { id, path, displayName: id, badgeColor: '', addedAt: 0, ...extra }
}

beforeEach(() => {
  localStorage.clear()
  resetFolderSidebarHiddenReposForTest()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('folder sidebar hidden repos', () => {
  it('hides a repo by host and path, so a re-added repo with a new id stays hidden', () => {
    setReposHiddenFromSidebar([repo('old-id', '/work/cat/docs/etf')], true)

    const ids = getSidebarHiddenRepoIds([
      repo('new-id', '/work/cat/docs/etf'),
      repo('bfs', '/work/cat/bfs')
    ])

    expect([...ids]).toEqual(['new-id'])
  })

  it('keeps the same path on another host and non-git folders visible', () => {
    setReposHiddenFromSidebar([repo('etf', '/work/cat/docs/etf')], true)

    const ids = getSidebarHiddenRepoIds([
      repo('remote', '/work/cat/docs/etf', { connectionId: 'ssh-1' }),
      repo('folder', '/work/cat/docs/etf', { kind: 'folder' })
    ])

    expect(ids.size).toBe(0)
  })

  it('persists across reloads and can be shown again', () => {
    const etf = repo('etf', '/work/cat/docs/etf')
    setReposHiddenFromSidebar([etf], true)
    resetFolderSidebarHiddenReposForTest()
    expect(isRepoHiddenFromSidebar(etf)).toBe(true)

    setReposHiddenFromSidebar([etf], false)
    resetFolderSidebarHiddenReposForTest()
    expect(isRepoHiddenFromSidebar(etf)).toBe(false)
  })

  it('notifies subscribers on every change', () => {
    const listener = vi.fn()
    subscribeFolderSidebarHiddenRepos(listener)

    setReposHiddenFromSidebar([repo('etf', '/work/cat/docs/etf')], true)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores corrupt storage instead of throwing', () => {
    localStorage.setItem('orca.fork.folderSidebarHiddenRepos', '{not json')

    expect(getSidebarHiddenRepoIds([repo('etf', '/work/cat/docs/etf')]).size).toBe(0)
  })
})
