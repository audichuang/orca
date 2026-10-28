// @vitest-environment happy-dom

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { MANAGED_RUNTIME_INSTALL_RUNTIME_CAPABILITY as INSTALL } from '../../../../shared/managed-runtime-install'
import {
  STRUCTURED_AGENT_SESSION_CLIENT_LAUNCH_MODE_CAPABILITY as CLIENT,
  STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY as CATALOG,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY as CHAT
} from '../../../../shared/protocol-version'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

const rpc = vi.hoisted(() => ({ call: vi.fn(), subscribe: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc.call }))
vi.mock('@/runtime/runtime-rpc-subscribe', () => ({ subscribeRuntimeRpc: rpc.subscribe }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
import { useAppStore } from '@/store'
import { makeFolderWorkspace } from '@/store/slices/worktrees-slice-test-fixtures'
import { resetHostStructuredAgentsForTests } from '@/runtime/host-structured-agents'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import { clearHostAgentMenuSettingsForTests } from '../settings/use-host-agent-launch-preferences'
import { useSavedSourceControlActionStart } from './use-saved-source-control-action-start'
import { useSourceControlAgentActionDialog } from './useSourceControlAgentActionDialog'

// Fork: a folder workspace's repo launch starts below the folder root (/work), where only a
// terminal applies, so a chat-only agent (antigravity: no CLI detected) cannot start there.
const FOLDER = folderWorkspaceKey('folder-1')
const REPO_CWD = '/work/repo-1'
const initial = useAppStore.getState()

beforeEach(() => {
  rpc.call.mockReset().mockResolvedValue({
    agents: [{ agent: 'antigravity', capabilities: {}, managedRuntime: true }]
  })
  rpc.subscribe.mockReset().mockResolvedValue({ unsubscribe: vi.fn() })
  setLocalRuntimeCapabilitiesForTests([CHAT, CLIENT, CATALOG, INSTALL])
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), experimentalNativeChat: true },
    folderWorkspaces: [makeFolderWorkspace({ id: 'folder-1', folderPath: '/work' })],
    ensureDetectedAgents: async () => [],
    detectedAgentIds: [],
    localDetectedAgentIdsByContext: { host: [] }
  })
})
afterEach(() => {
  cleanup()
  clearHostAgentMenuSettingsForTests()
  resetHostStructuredAgentsForTests()
  setLocalRuntimeCapabilitiesForTests(null)
  useAppStore.setState(initial, true)
})

describe('saved Source Control action start in a folder workspace', () => {
  async function startSaved(initialCwd?: string) {
    const onStart = vi.fn().mockResolvedValue(true)
    const onFallback = vi.fn()
    const { result } = renderHook(() => useSavedSourceControlActionStart())
    await result.current.start({
      recipe: { agentId: 'antigravity', agentArgs: '--saved' },
      basePrompt: 'Resolve conflicts.',
      actionId: 'resolveConflicts',
      settings: useAppStore.getState().settings,
      repo: null,
      worktreeId: FOLDER,
      initialCwd,
      promptDelivery: 'submit-after-ready',
      launchSource: 'source_control_recovery',
      connectionId: null,
      onStart,
      onClose: () => {},
      onFallback
    })
    return { onStart, onFallback }
  }

  it('starts a saved chat-only agent at the folder root as a chat', async () => {
    const { onStart, onFallback } = await startSaved()
    expect(onFallback).not.toHaveBeenCalled()
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'antigravity',
        launchChoice: expect.objectContaining({ route: 'structured-native-chat' })
      })
    )
  })

  it('falls back instead of starting a saved chat-only agent for a repo below the folder root', async () => {
    const { onStart, onFallback } = await startSaved(REPO_CWD)
    expect(onStart).not.toHaveBeenCalled()
    expect(onFallback).toHaveBeenCalledOnce()
  })
})

describe('Source Control action dialog in a folder workspace', () => {
  function renderDialog(initialCwd?: string) {
    return renderHook(() =>
      useSourceControlAgentActionDialog({
        open: true,
        initialRecipe: { agentId: 'antigravity' },
        onOpenChange: () => {},
        actionId: 'resolveConflicts',
        title: '',
        description: '',
        baseCommandInput: 'Resolve conflicts.',
        launchSource: 'source_control_recovery',
        savedAgentId: 'antigravity',
        worktreeId: FOLDER,
        connectionId: null,
        initialCwd,
        onStart: vi.fn().mockResolvedValue(true)
      })
    )
  }

  it('can start a saved chat-only agent at the folder root', async () => {
    const { result } = renderDialog()
    await waitFor(() => expect(result.current.canStart).toBe(true))
    expect(result.current.agentArgsApply).toBe(false)
  })

  it('cannot start a saved chat-only agent for a repo below the folder root', async () => {
    const { result } = renderDialog(REPO_CWD)
    await waitFor(() => expect(result.current.surfaceRows.selection.ready).toBe(true))
    expect(result.current.canStart).toBe(false)
  })
})
