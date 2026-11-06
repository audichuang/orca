import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { AppState } from '../../../types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { resolveFolderFileGitOwner, withFolderFileGitOwner } from './folder-file-git-owner'

function repo(id: string, path: string): Repo {
  return { id, path, displayName: id, badgeColor: '', addedAt: 0 }
}

function worktree(id: string, repoId: string, path: string): Worktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only id, repoId, path and isMainWorktree.
  return { id, repoId, path, isMainWorktree: true } as Worktree
}

const folderState: Pick<AppState, 'folderWorkspaces' | 'worktreesByRepo' | 'repos'> = {
  folderWorkspaces: [
    {
      id: 'f1',
      projectGroupId: 'g1',
      name: 'p',
      folderPath: '/p',
      connectionId: null,
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      createdAt: 0,
      lastActivityAt: 0,
      updatedAt: 0
    }
  ],
  repos: [repo('web', '/p/web'), repo('inner', '/p/web/plugins/inner')],
  worktreesByRepo: {
    web: [worktree('web-main', 'web', '/p/web')],
    inner: [worktree('inner-main', 'inner', '/p/web/plugins/inner')]
  }
}

describe('resolveFolderFileGitOwner', () => {
  it('binds a folder file to the repo holding it', () => {
    expect(resolveFolderFileGitOwner(folderState, 'folder:f1', '/p/web/src/a.ts')).toEqual({
      gitWorktreeId: 'web-main'
    })
  })

  it('prefers the deepest nested repo', () => {
    expect(
      resolveFolderFileGitOwner(folderState, 'folder:f1', '/p/web/plugins/inner/index.md')
    ).toEqual({ gitWorktreeId: 'inner-main' })
  })

  it('leaves untitled notes on the folder owner', () => {
    const note = {
      filePath: '/p/web/untitled.md',
      worktreeId: 'folder:f1',
      relativePath: 'web/untitled.md',
      mode: 'edit' as const,
      isUntitled: true
    }
    expect(withFolderFileGitOwner(folderState, note)).toBe(note)
  })

  it('leaves files outside any repo and non-folder workspaces unbound', () => {
    expect(resolveFolderFileGitOwner(folderState, 'folder:f1', '/p/notes/todo.txt')).toBeNull()
    expect(resolveFolderFileGitOwner(folderState, 'web-main', '/p/web/src/a.ts')).toBeNull()
  })
})

describe('openFile in a folder workspace', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState(folderState)
  })

  const explorerOpen = {
    filePath: '/p/web/README.md',
    relativePath: 'web/README.md',
    worktreeId: 'folder:f1',
    runtimeEnvironmentId: null,
    language: 'markdown',
    mode: 'edit' as const
  }

  it('gives an Explorer open the git owner Source Control would', () => {
    useAppStore.getState().openFile(explorerOpen, { suppressActiveRuntimeFallback: true })
    expect(useAppStore.getState().openFiles[0]).toMatchObject({
      relativePath: 'web/README.md',
      gitWorktreeId: 'web-main'
    })
  })

  it('stores a Source Control open folder-relative', () => {
    useAppStore
      .getState()
      .openFile(
        { ...explorerOpen, relativePath: 'README.md', gitWorktreeId: 'web-main' },
        { suppressActiveRuntimeFallback: true }
      )
    expect(useAppStore.getState().openFiles[0]).toMatchObject({
      relativePath: 'web/README.md',
      gitWorktreeId: 'web-main'
    })
  })

  it('keeps a Source Control open outside the folder root repo-relative', () => {
    useAppStore.setState({
      repos: [repo('mono', '/m')],
      worktreesByRepo: { mono: [worktree('mono-main', 'mono', '/m')] },
      folderWorkspaces: [{ ...folderState.folderWorkspaces[0], folderPath: '/m/pkg' }]
    })
    useAppStore.getState().openFile(
      {
        ...explorerOpen,
        filePath: '/m/tools/build.ts',
        relativePath: 'tools/build.ts',
        gitWorktreeId: 'mono-main'
      },
      { suppressActiveRuntimeFallback: true }
    )
    expect(useAppStore.getState().openFiles[0]).toMatchObject({
      relativePath: 'tools/build.ts',
      gitWorktreeId: 'mono-main'
    })
  })

  it('leaves an absolute open unbound so its reads stay in the folder', () => {
    useAppStore
      .getState()
      .openFile(
        { ...explorerOpen, relativePath: '/p/web/README.md' },
        { suppressActiveRuntimeFallback: true }
      )
    const [file] = useAppStore.getState().openFiles
    expect(file.relativePath).toBe('/p/web/README.md')
    expect(file.gitWorktreeId).toBeUndefined()
  })

  it('keeps one tab and its owner when Source Control and Explorer alternate', () => {
    const state = useAppStore.getState()
    state.openFile(
      { ...explorerOpen, relativePath: 'README.md', gitWorktreeId: 'web-main' },
      { suppressActiveRuntimeFallback: true }
    )
    state.openFile(explorerOpen, { suppressActiveRuntimeFallback: true })
    const files = useAppStore.getState().openFiles
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ relativePath: 'web/README.md', gitWorktreeId: 'web-main' })
  })
})
