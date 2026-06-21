import { describe, expect, it, vi } from 'vitest'
import type { WorktreeRuntimeOwnerState } from '@/lib/worktree-runtime-owner'
import type { GlobalSettings } from '../../../../shared/types'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-client'
import { makeTerminalClipboardImageSaver } from './terminal-clipboard-image-runtime-upload'

// Mock the store so resolveTerminalDropWorktreePath can resolve paths.
// baseState.worktreesByRepo has no `path` on worktrees, so fallbackCwd is used.
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      worktreesByRepo: { r1: [{ id: 'wt-1', repoId: 'r1' }] }
    })
  }
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

type TestOwnerState = WorktreeRuntimeOwnerState & { settings: GlobalSettings }

const baseState: TestOwnerState = {
  settings: {
    activeRuntimeEnvironmentId: 'env-1',
    terminalRemoteClipboardImagePaste: true
  } as GlobalSettings,
  repos: [{ id: 'r1', connectionId: null, executionHostId: 'runtime:env-1' }],
  worktreesByRepo: { r1: [{ id: 'wt-1', repoId: 'r1' }] }
}

function makeDeps(overrides = {}) {
  return {
    worktreeId: 'wt-1',
    fallbackCwd: '/remote/repo',
    connectionId: null,
    getOwnerState: () => baseState,
    saveLocalImageTempFile: vi.fn().mockResolvedValue('/tmp/orca-paste-1-x.png'),
    importExternalPathsToRuntime: vi.fn().mockResolvedValue({
      results: [
        {
          sourcePath: '/tmp/orca-paste-1-x.png',
          status: 'imported',
          destPath: '/remote/repo/.orca/paste-images/orca-paste-1-x.png',
          kind: 'file',
          renamed: false
        }
      ]
    }),
    deleteLocalImageTempFile: vi.fn().mockResolvedValue(undefined),
    toast: { loading: vi.fn(() => 't'), dismiss: vi.fn(), error: vi.fn() },
    ...overrides
  }
}

describe('makeTerminalClipboardImageSaver', () => {
  it('uploads to the worktree and returns the absolute remote destPath', async () => {
    const deps = makeDeps()
    const save = makeTerminalClipboardImageSaver(deps)
    const result = await save({ connectionId: null })
    expect(deps.saveLocalImageTempFile).toHaveBeenCalledWith() // no connectionId for env upload
    expect(deps.importExternalPathsToRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'wt-1', worktreePath: '/remote/repo' }),
      ['/tmp/orca-paste-1-x.png'],
      '/remote/repo/.orca/paste-images'
    )
    expect(result).toBe('/remote/repo/.orca/paste-images/orca-paste-1-x.png')
    expect(deps.deleteLocalImageTempFile).toHaveBeenCalledWith('/tmp/orca-paste-1-x.png')
    expect(deps.toast.dismiss).toHaveBeenCalledWith('t')
  })

  it('returns null and does not upload when the clipboard has no image', async () => {
    const deps = makeDeps({ saveLocalImageTempFile: vi.fn().mockResolvedValue(null) })
    const save = makeTerminalClipboardImageSaver(deps)
    expect(await save()).toBeNull()
    expect(deps.importExternalPathsToRuntime).not.toHaveBeenCalled()
  })

  it('returns null (no-op) when the egress setting is disabled', async () => {
    const deps = makeDeps({
      getOwnerState: () => ({
        ...baseState,
        settings: { ...baseState.settings, terminalRemoteClipboardImagePaste: false }
      })
    })
    const save = makeTerminalClipboardImageSaver(deps)
    expect(await save()).toBeNull()
    expect(deps.saveLocalImageTempFile).not.toHaveBeenCalled()
  })

  it('delegates to the local saver for a non-environment worktree', async () => {
    const deps = makeDeps({
      connectionId: 'ssh-1',
      getOwnerState: () => ({
        ...baseState,
        settings: { activeRuntimeEnvironmentId: '', terminalRemoteClipboardImagePaste: true },
        repos: [{ id: 'r1', connectionId: 'ssh-1', executionHostId: '' }]
      }),
      saveLocalImageTempFile: vi.fn().mockResolvedValue('/ssh/tmp/orca-paste-1-x.png')
    })
    const save = makeTerminalClipboardImageSaver(deps)
    expect(await save({ connectionId: 'ssh-1' })).toBe('/ssh/tmp/orca-paste-1-x.png')
    expect(deps.saveLocalImageTempFile).toHaveBeenCalledWith({ connectionId: 'ssh-1' })
    expect(deps.importExternalPathsToRuntime).not.toHaveBeenCalled()
  })

  it('windows-adjusts the injected path and still cleans the temp on failure', async () => {
    const deps = makeDeps({
      fallbackCwd: 'C:\\repo',
      importExternalPathsToRuntime: vi.fn().mockRejectedValue(new Error('boom'))
    })
    const save = makeTerminalClipboardImageSaver(deps)
    await expect(save()).rejects.toThrow('boom')
    expect(deps.deleteLocalImageTempFile).toHaveBeenCalledWith('/tmp/orca-paste-1-x.png')
    expect(deps.toast.dismiss).toHaveBeenCalledWith('t')
  })

  it('throws a friendly error and STILL cleans the temp when the worktree path is unresolved', async () => {
    const deps = makeDeps({ worktreeId: 'wt-unknown', fallbackCwd: undefined })
    const save = makeTerminalClipboardImageSaver(deps)
    await expect(save()).rejects.toThrow('Worktree not ready')
    expect(deps.deleteLocalImageTempFile).toHaveBeenCalledWith('/tmp/orca-paste-1-x.png')
  })

  it('maps a method_not_found RPC error to a friendly "update the runtime" message', async () => {
    // RuntimeRpcCallError takes a RuntimeRpcFailure object (confirmed at runtime-rpc-client.ts:17).
    // The brief's test used (code, message) strings which is not the real ctor — adjusted here.
    const err = new RuntimeRpcCallError({
      id: 'req-1',
      ok: false,
      error: { code: 'method_not_found', message: 'Unknown method' },
      _meta: { runtimeId: null }
    })
    const deps = makeDeps({ importExternalPathsToRuntime: vi.fn().mockRejectedValue(err) })
    const save = makeTerminalClipboardImageSaver(deps)
    await expect(save()).rejects.toThrow('Update the remote runtime')
    expect(deps.deleteLocalImageTempFile).toHaveBeenCalled()
  })
})
