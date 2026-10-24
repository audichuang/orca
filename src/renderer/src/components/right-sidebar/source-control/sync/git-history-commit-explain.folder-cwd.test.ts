import { beforeEach, expect, it, vi } from 'vitest'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'
import type { GitHistoryItem } from '../../../../../../shared/git-history'

const mocks = vi.hoisted(() => ({
  resolveAgent: vi.fn(),
  launchAgentInNewTab: vi.fn()
}))
vi.mock('@/lib/agent-tab-shortcuts', () => ({
  resolveDefaultAgentForWorktreeNewTab: mocks.resolveAgent
}))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launchAgentInNewTab }))
vi.mock('@/lib/agent-detection-target-inventory', () => ({
  getDetectionTargetIdentityForWorktree: () => 'local'
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const { explainCommitWithDefaultAgent } = await import('./git-history-commit-explain')

const REPO = 'repo-1::/work/repo-1'
const FOLDER = folderWorkspaceKey('folder-1')
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the explain prompt reads only id, displayId and subject.
const item = { id: 'abc123', displayId: 'abc123', subject: 'Fix it' } as GitHistoryItem

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveAgent.mockResolvedValue('claude')
})

it('picks the agent where a folder repo launch starts, not at the repo worktree', async () => {
  await explainCommitWithDefaultAgent(REPO, item, {
    tabOwnerId: FOLDER,
    initialCwd: '/work/repo-1'
  })
  expect(mocks.resolveAgent).toHaveBeenCalledWith(expect.any(Function), REPO, {
    worktreeId: FOLDER,
    cwd: '/work/repo-1'
  })
  expect(mocks.launchAgentInNewTab).toHaveBeenCalledWith(
    expect.objectContaining({ agent: 'claude', worktreeId: FOLDER, initialCwd: '/work/repo-1' })
  )
})
