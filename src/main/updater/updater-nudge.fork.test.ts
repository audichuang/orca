import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { appMock, autoUpdaterMock, fetchNudgeMock, moduleFactories, resetUpdaterMocks } =
  await vi.hoisted(async () => (await import('../updater-test-harness')).createUpdaterMocks())

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('../electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('../ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('../linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('../updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('../updater-changelog', () => moduleFactories.updaterChangelog())
// Why only the network edge: the real UpdaterNudge guard must run.
vi.mock('../updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('../update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('../updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('../local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('../local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

// Why direct calls: setup and menu checks guard first, so these inner fork guards are reached only here.
async function loadProbe(window: BrowserWindow) {
  const { UpdaterSetup } = await import('./updater-setup')
  class Probe extends UpdaterSetup {
    constructor() {
      super()
      this.mainWindowRef = window
    }
    checkNudge(): Promise<void> {
      return this.checkForUpdateNudge()
    }
    checkPinned(): Promise<void> {
      return this.checkForPinnedBuild('stable', 'v99.0.0')
    }
  }
  return new Probe()
}

// Why: the first cold import of updater-setup takes seconds and passed the 30s test timeout under full-suite load.
beforeAll(async () => {
  await import('./updater-setup')
}, 120_000)

describe.each([
  { fork: true, label: 'a packaged fork distribution' },
  { fork: false, label: 'a packaged upstream build (control)' }
])('updater inner guards in $label', ({ fork }) => {
  let appPath = ''
  const send = vi.fn()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the updater only calls webContents.send on its window.
  const window = { webContents: { send } } as never as BrowserWindow

  beforeEach(() => {
    vi.resetModules()
    resetUpdaterMocks()
    send.mockReset()
    appPath = mkdtempSync(join(tmpdir(), 'orca-fork-app-'))
    writeFileSync(join(appPath, 'package.json'), JSON.stringify({ orcaForkDistribution: fork }))
    Object.assign(appMock, { isPackaged: true, getAppPath: () => appPath })
  })
  afterEach(() => {
    rmSync(appPath, { recursive: true, force: true })
  })

  it(fork ? 'never polls update campaigns' : 'polls update campaigns', async () => {
    await (await loadProbe(window)).checkNudge()

    expect(fetchNudgeMock).toHaveBeenCalledTimes(fork ? 0 : 1)
  })

  it(
    fork ? 'refuses a pinned build without touching the feed' : 'pins the feed for a build',
    async () => {
      await (await loadProbe(window)).checkPinned()

      if (fork) {
        expect(send.mock.calls).toEqual([
          ['updater:status', { state: 'not-available', userInitiated: true }]
        ])
        expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
      } else {
        expect(autoUpdaterMock.setFeedURL).toHaveBeenCalled()
      }
    }
  )
})
