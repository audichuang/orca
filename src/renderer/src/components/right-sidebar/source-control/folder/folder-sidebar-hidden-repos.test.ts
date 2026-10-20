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
    setReposHiddenFromSidebar([repo('old-id', '/work/folder/docs/hidden')], true)

    const ids = getSidebarHiddenRepoIds([
      repo('new-id', '/work/folder/docs/hidden'),
      repo('visible', '/work/folder/visible')
    ])

    expect([...ids]).toEqual(['new-id'])
  })

  it('keeps the same path on another host and non-git folders visible', () => {
    setReposHiddenFromSidebar([repo('hidden', '/work/folder/docs/hidden')], true)

    const ids = getSidebarHiddenRepoIds([
      repo('remote', '/work/folder/docs/hidden', { connectionId: 'ssh-1' }),
      repo('folder', '/work/folder/docs/hidden', { kind: 'folder' })
    ])

    expect(ids.size).toBe(0)
  })

  it('persists across reloads and can be shown again', () => {
    const hidden = repo('hidden', '/work/folder/docs/hidden')
    setReposHiddenFromSidebar([hidden], true)
    resetFolderSidebarHiddenReposForTest()
    expect(isRepoHiddenFromSidebar(hidden)).toBe(true)

    setReposHiddenFromSidebar([hidden], false)
    resetFolderSidebarHiddenReposForTest()
    expect(isRepoHiddenFromSidebar(hidden)).toBe(false)
  })

  it('notifies subscribers on every change', () => {
    const listener = vi.fn()
    subscribeFolderSidebarHiddenRepos(listener)

    setReposHiddenFromSidebar([repo('hidden', '/work/folder/docs/hidden')], true)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores corrupt storage instead of throwing', () => {
    localStorage.setItem('orca.fork.folderSidebarHiddenRepos', '{not json')

    expect(getSidebarHiddenRepoIds([repo('hidden', '/work/folder/docs/hidden')]).size).toBe(0)
  })
})
