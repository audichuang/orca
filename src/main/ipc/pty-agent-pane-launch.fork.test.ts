import { ptyIncarnationById, ptyOwnership } from './pty/provider/ownership-state'
import { createLaunchRaceRuntime } from './pty-launch-race-test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentPaneLaunchRequest } from '../../shared/agent-pane-launch-request'
import { setupPtyIpcSuite } from './pty-ipc-test-harness'
import { registerPtyHandlers } from './pty/register-handlers'
import { resetAgentLaunchPanesForTests } from '../agent-launch/agent-launch-pane-attachment'

vi.mock('electron', () => import('./pty-ipc-mock-registry').then((m) => m.electronModuleMock()))
vi.mock('fs', () => import('./pty-ipc-mock-registry').then((m) => m.fsModuleMock()))
vi.mock('node:fs/promises', async (importOriginal) =>
  (await import('./pty-ipc-mock-registry')).fsPromisesModuleMock(await importOriginal())
)
vi.mock('node-pty', () => import('./pty-ipc-mock-registry').then((m) => m.nodePtyModuleMock()))
vi.mock('node:child_process', async (importOriginal) =>
  (await import('./pty-ipc-mock-registry')).childProcessModuleMock(await importOriginal())
)
vi.mock('../opencode/hook-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.openCodeHookServiceModuleMock())
)
vi.mock('../mimo/hook-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.mimoHookServiceModuleMock())
)
vi.mock('../agent-hooks/server', () =>
  import('./pty-ipc-mock-registry').then((m) => m.agentHookServerModuleMock())
)
vi.mock('../pi/titlebar-extension-service', () =>
  import('./pty-ipc-mock-registry').then((m) => m.piTitlebarExtensionModuleMock())
)
vi.mock('../pwsh', () => import('./pty-ipc-mock-registry').then((m) => m.pwshModuleMock()))
vi.mock('../wsl', async (importOriginal) =>
  (await import('./pty-ipc-mock-registry')).wslModuleMock(await importOriginal())
)
vi.mock('../telemetry/client', () =>
  import('./pty-ipc-mock-registry').then((m) => m.telemetryClientModuleMock())
)
vi.mock('../telemetry/classify-error', () =>
  import('./pty-ipc-mock-registry').then((m) => m.classifyErrorModuleMock())
)
vi.mock('../cli/linux-terminal-orca-cli-shim', () =>
  import('./pty-ipc-mock-registry').then((m) => m.linuxCliShimModuleMock())
)
vi.mock('../memory/pty-registry', () =>
  import('./pty-ipc-mock-registry').then((m) => m.ptyRegistryModuleMock())
)
vi.mock('../agent-hooks/migration-unsupported-pty-state', () =>
  import('./pty-ipc-mock-registry').then((m) => m.migrationUnsupportedPtyModuleMock())
)
vi.mock('../codex/codex-pane-account-registry', () =>
  import('./pty-ipc-mock-registry').then((m) => m.codexPaneAccountRegistryModuleMock())
)
vi.mock('../codex/codex-state-db-backfill-recovery', () =>
  import('./pty-ipc-mock-registry').then((m) => m.codexBackfillRecoveryModuleMock())
)

// A folder workspace's AI button names one repo as its cwd while the pane sits at the folder root.
describe('a pane that starts its own agent launch inside a folder repo', () => {
  const { handlers, mainWindow, installDaemonTestProvider } = setupPtyIpcSuite()
  const tabId = 'tab-pane-launch'
  const leafId = '66666666-6666-4666-8666-666666666666'
  const worktreeId = 'repo-1::/tmp/pane-launch'
  const AI_BUTTON: AgentPaneLaunchRequest = {
    launch: { agent: 'claude', target: { kind: 'existing', worktree: `id:${worktreeId}` } }
  }

  afterEach(() => {
    resetAgentLaunchPanesForTests()
    ptyIncarnationById.delete('pty-agent')
    ptyOwnership.delete('pty-agent')
  })

  function register(
    providerSpawn: ReturnType<typeof vi.fn>,
    plan: () => Promise<Record<string, unknown>> = async () => ({ command: 'claude' })
  ) {
    installDaemonTestProvider({ spawn: providerSpawn })
    const runtime = {
      ...createLaunchRaceRuntime(),
      setPtyController: vi.fn(),
      createPreAllocatedTerminalHandle: vi.fn(() => 'term_pane'),
      registerPreAllocatedHandleForPty: vi.fn(),
      onPtySpawned: vi.fn(),
      onPtyExit: vi.fn(),
      onPtyData: vi.fn(),
      hasLiveTerminalForPaneKey: vi.fn(() => false),
      reportAgentLaunchPaneVerdict: vi.fn(),
      showTerminalWorkspaceLaunchScope: vi.fn(async () => ({
        id: worktreeId,
        path: '/tmp/pane-launch',
        connectionId: null,
        repo: null,
        folderWorkspace: null
      })),
      planAgentPaneLaunch: vi.fn(plan),
      getTerminalHandleForPaneKey: vi.fn(() => null),
      closeTerminal: vi.fn(async () => ({}))
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the suite's window double, carrying the members a renderer spawn reaches.
    const window = mainWindow as never
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: a runtime carrying only the members a pane's own launch reaches.
    const spawnRuntime = runtime as never
    registerPtyHandlers(window, spawnRuntime)
    return runtime
  }

  function spawnPane(
    agentLaunch: AgentPaneLaunchRequest = AI_BUTTON,
    pane: Record<string, unknown> = {}
  ): Promise<unknown> {
    return Promise.resolve(
      handlers.get('pty:spawn')!(null, {
        cols: 132,
        rows: 40,
        cwd: '/tmp/pane-launch',
        worktreeId,
        tabId,
        leafId,
        command: '',
        agentLaunch,
        ...pane
      })
    )
  }

  it("starts in the launch's cwd, not the pane's workspace root", async () => {
    // A folder workspace's AI button runs inside one repo: the launch names that repo, the pane its root.
    const providerSpawn = vi.fn(async (_options: { cwd?: string }) => ({ id: 'pty-agent' }))
    register(providerSpawn)

    await spawnPane({ launch: { ...AI_BUTTON.launch, cwd: '/tmp/pane-launch/libs/core' } })

    expect(providerSpawn.mock.calls[0]?.[0].cwd).toBe('/tmp/pane-launch/libs/core')
  })
})
