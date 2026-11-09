import { vi } from 'vitest'
import { useAppStore } from '@/store'
import { makeFolderWorkspace } from '@/store/folder-workspaces/folder-workspace.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import { clearRuntimeCompatibilityCache } from '@/runtime/rpc/compatibility/runtime-compatibility-cache'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/rpc/testing/runtime-compatibility-test-fixture'
import type { OpenFile } from '@/store/slices/editor/types/open-file'

export const FOLDER = 'folder:folder'
export const REPO = 'repo-a::/work/folder/repo-a'
export const ROOT = '/work/folder/repo-a'
export const COMMIT = {
  baseRef: 'HEAD^',
  compareRef: 'HEAD',
  commitOid: 'b'.repeat(40),
  parentOid: 'a'.repeat(40),
  compareVersion: 'commit-version'
}
export const DIFF = {
  kind: 'text' as const,
  originalContent: 'before',
  modifiedContent: 'after',
  originalIsBinary: false as const,
  modifiedIsBinary: false as const
}

// A Source Control open from the folder: upstream owns the tab by the repo and places it in the folder.
export function repoDiffFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: 'repo-diff',
    filePath: `${ROOT}/src/a.ts`,
    relativePath: 'src/a.ts',
    worktreeId: REPO,
    runtimeEnvironmentId: 'server',
    language: 'typescript',
    mode: 'diff',
    diffSource: 'unstaged',
    isDirty: false,
    ...overrides
  }
}

export function seedFolderWithRepo(): void {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    activeWorktreeId: FOLDER,
    repos: [{ ...TEST_REPO, id: 'repo-a', path: ROOT, executionHostId: 'runtime:server' }],
    worktreesByRepo: {
      'repo-a': [
        makeWorktree({
          id: REPO,
          repoId: 'repo-a',
          path: ROOT,
          hostId: 'runtime:server',
          runtimeOwnerEnvironmentId: 'server'
        })
      ]
    },
    folderWorkspaces: [
      makeFolderWorkspace({
        id: 'folder',
        folderPath: '/work/folder',
        executionHostId: 'runtime:server'
      })
    ]
  })
}

export function installFolderRuntime() {
  clearRuntimeCompatibilityCache()
  const previous = window.api
  const call = vi.fn(async (args: { selector: string; method: string; params?: unknown }) => {
    if (args.method === 'status.get') {
      return createCompatibleRuntimeStatusResponse()
    }
    let result: unknown
    if (args.method.startsWith('git.')) {
      result = DIFF
    } else if (args.method === 'files.read') {
      result = { content: 'disk', truncated: false }
    } else if (args.method === 'files.stat') {
      result = { size: 0, isDirectory: false, mtime: 1 }
    } else if (args.method === 'files.delete') {
      result = {}
    } else {
      throw new Error(`Unexpected runtime request: ${args.method}`)
    }
    return { id: 'request', ok: true, result }
  })
  Object.assign(window, {
    api: { ...previous, runtimeEnvironments: { ...previous?.runtimeEnvironments, call } }
  })
  return { call, restore: () => Object.assign(window, { api: previous }) }
}
