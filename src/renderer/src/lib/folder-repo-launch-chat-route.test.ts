import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { MANAGED_RUNTIME_INSTALL_RUNTIME_CAPABILITY as INSTALL } from '../../../shared/managed-runtime-install'
import {
  STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY as CATALOG,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY as CHAT
} from '../../../shared/protocol-version'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'

const rpc = vi.hoisted(() => ({ call: vi.fn(), subscribe: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc.call }))
vi.mock('@/runtime/runtime-rpc-subscribe', () => ({ subscribeRuntimeRpc: rpc.subscribe }))
import { useAppStore } from '@/store'
import { makeFolderWorkspace, makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import { resetHostStructuredAgentsForTests } from '@/runtime/host-structured-agents'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import { acquireAgentLaunchChoices } from './host-chat-program-acquisition'
import { agentChoiceMayOpenAsChat, agentsOfferedForLaunch } from './host-chat-program'
import { resolveDefaultAgentForWorktreeNewTab } from './agent-tab-shortcuts'
import { sourceControlLaunchAppliesAgentArgs } from '@/components/right-sidebar/source-control-launch-agent-args-applicability'

// Fork: a folder workspace's repo launch starts below the folder root, which only a terminal applies.
const initial = useAppStore.getState()
const folder = { kind: 'folder', worktreeId: folderWorkspaceKey('folder-1') } as const

beforeEach(() => {
  rpc.call.mockReset().mockResolvedValue({
    agents: [{ agent: 'antigravity', capabilities: {}, managedRuntime: true }]
  })
  rpc.subscribe.mockReset().mockResolvedValue({ unsubscribe: vi.fn() })
  setLocalRuntimeCapabilitiesForTests([CHAT, CATALOG, INSTALL])
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), experimentalNativeChat: true },
    folderWorkspaces: [makeFolderWorkspace({ id: 'folder-1', folderPath: '/work' })],
    ensureDetectedAgents: async () => []
  })
})
afterEach(() => {
  resetHostStructuredAgentsForTests()
  setLocalRuntimeCapabilitiesForTests(null)
  useAppStore.setState(initial, true)
})

it('offers a chat-only agent at the folder root but not for a repo below it', async () => {
  await acquireAgentLaunchChoices(folder, async () => [])
  const state = useAppStore.getState()
  expect(agentChoiceMayOpenAsChat(state, 'antigravity', folder, [])).toBe(true)
  expect(agentChoiceMayOpenAsChat(state, 'antigravity', folder, [], '/work')).toBe(true)
  expect(agentChoiceMayOpenAsChat(state, 'antigravity', folder, [], '/work/repo-1')).toBe(false)
  expect(agentsOfferedForLaunch(state, folder, [])).toContain('antigravity')
  expect(agentsOfferedForLaunch(state, folder, [], '/work/repo-1')).not.toContain('antigravity')
})

it('picks a chat-only default agent at the folder root but not for a repo below it', async () => {
  const repo = 'repo-1::/work/repo-1'
  useAppStore.setState({
    settings: { ...useAppStore.getState().settings!, defaultTuiAgent: 'antigravity' },
    worktreesByRepo: {
      'repo-1': [makeWorktree({ id: repo, repoId: 'repo-1', path: '/work/repo-1' })]
    }
  })
  // Detected in the repo, launched in the folder workspace as Explain commit does.
  const pick = (cwd: string) =>
    resolveDefaultAgentForWorktreeNewTab(useAppStore.getState, repo, {
      worktreeId: folder.worktreeId,
      cwd
    })
  await expect(pick('/work')).resolves.toBe('antigravity')
  await expect(pick('/work/repo-1')).resolves.not.toBe('antigravity')
})

it('applies CLI arguments to a chat-default agent launched in a repo below the folder root', async () => {
  await acquireAgentLaunchChoices(folder, async () => [])
  const target = { agent: 'antigravity', worktreeId: folder.worktreeId } as const
  expect(sourceControlLaunchAppliesAgentArgs(target)).toBe(false)
  expect(sourceControlLaunchAppliesAgentArgs({ ...target, initialCwd: '/work/repo-1' })).toBe(true)
})
