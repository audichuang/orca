import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { MANAGED_RUNTIME_INSTALL_RUNTIME_CAPABILITY as INSTALL } from '../../../shared/managed-runtime-install'
import { STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY as CHAT } from '../../../shared/agent-session/agent-session-runtime-capabilities'
import { STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY as CATALOG } from '../../../shared/agent-session/structured-agent-session-surface-capabilities'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'

const rpc = vi.hoisted(() => ({ call: vi.fn(), subscribe: vi.fn() }))
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: rpc.call }))
vi.mock('@/runtime/rpc/subscriptions/runtime-rpc-subscribe', () => ({
  subscribeRuntimeRpc: rpc.subscribe
}))
import { useAppStore } from '@/store'
import { makeFolderWorkspace } from '@/store/folder-workspaces/folder-workspace.test-fixture'
import { resetHostStructuredAgentsForTests } from '@/runtime/native-chat/agent-catalogs/host-structured-agents'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/hosts/capabilities/local-runtime-capabilities'
import { acquireAgentLaunchChoices } from './host-chat-program-acquisition'
import { sourceControlLaunchAppliesAgentArgs } from '@/components/right-sidebar/source-control/ai/source-control-launch-agent-args-applicability'

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
    settings: { ...getDefaultSettings('/tmp'), agentDefaultSurface: 'chat' },
    folderWorkspaces: [makeFolderWorkspace({ id: 'folder-1', folderPath: '/work' })],
    ensureDetectedAgents: async () => []
  })
})
afterEach(() => {
  resetHostStructuredAgentsForTests()
  setLocalRuntimeCapabilitiesForTests(null)
  useAppStore.setState(initial, true)
})

it('applies CLI arguments to a chat-default agent launched in a repo below the folder root', async () => {
  await acquireAgentLaunchChoices(folder, async () => [])
  const target = { agent: 'antigravity', worktreeId: folder.worktreeId } as const
  expect(sourceControlLaunchAppliesAgentArgs(target)).toBe(false)
  expect(sourceControlLaunchAppliesAgentArgs({ ...target, initialCwd: '/work/repo-1' })).toBe(true)
})
