import { vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  makeFolderWorkspace,
  makeWorktree,
  TEST_REPO
} from '@/store/slices/worktrees-slice-test-fixtures'
import { clearRuntimeCompatibilityCache } from '@/runtime/runtime-rpc-client'
import { createCompatibleRuntimeStatusResponse } from '@/runtime/runtime-compatibility-test-fixture'
import type { OpenFile } from '@/store/slices/editor'

export const FOLDER = 'folder:folder'
export const REPO = 'repo-a::/work/folder/repo-a'
export const ROOT = '/work/folder/repo-a'
export const BRANCH = {
  baseRef: 'main',
  compareRef: 'HEAD',
  baseOid: 'a'.repeat(40),
  headOid: 'b'.repeat(40),
  mergeBase: 'a'.repeat(40),
  compareVersion: 'branch-version'
}
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

export function folderFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: 'folder-file',
    filePath: `${ROOT}/src/a.ts`,
    relativePath: 'repo-a/src/a.ts',
    worktreeId: FOLDER,
    gitWorktreeId: REPO,
    runtimeEnvironmentId: 'server',
    language: 'typescript',
    mode: 'diff',
    diffSource: 'unstaged',
    isDirty: false,
    ...overrides
  }
}

export function seedFolderGitOwner(): void {
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
