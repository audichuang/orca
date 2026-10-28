import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './updater-test-module-loader'

const {
  appMock,
  autoUpdaterMock,
  powerMonitorOnMock,
  fetchNudgeMock,
  moduleFactories,
  resetUpdaterMocks
} = await vi.hoisted(async () => (await import('./updater-test-harness')).createUpdaterMocks())

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater-nudge', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

warmUpdaterModule()

function fakeWindow(send = vi.fn()): BrowserWindow {
  const live = () => false
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the updater only checks isDestroyed and calls webContents.send on its window.
  return { isDestroyed: live, webContents: { send, isDestroyed: live } } as never
}

// The fork's feed would be upstream's releases, so a packaged fork build must never auto-update.
describe('updater in a packaged fork distribution', () => {
  let appPath = ''
  beforeEach(() => {
    resetUpdaterMocks()
    appPath = mkdtempSync(join(tmpdir(), 'orca-fork-app-'))
    writeFileSync(join(appPath, 'package.json'), '{"orcaForkDistribution":true}')
    Object.assign(appMock, { isPackaged: true, getAppPath: () => appPath })
  })
  afterEach(() => {
    rmSync(appPath, { recursive: true, force: true })
  })

  it('never configures electron-updater at setup', async () => {
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(fakeWindow())

    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.on).not.toHaveBeenCalled()
    expect(powerMonitorOnMock).not.toHaveBeenCalled()
    expect(fetchNudgeMock).not.toHaveBeenCalled()
  })

  it('answers background and menu checks with not-available instead of checking', async () => {
    const send = vi.fn()
    const { checkForUpdates, checkForUpdatesFromMenu, setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(fakeWindow(send))

    checkForUpdates()
    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledWith('updater:status', { state: 'not-available' })
    })
    checkForUpdatesFromMenu()
    expect(send).toHaveBeenCalledWith('updater:status', {
      state: 'not-available',
      userInitiated: true
    })
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('tells remote clients the server cannot update itself', async () => {
    const { getRemoteServerUpdateSupport, setupAutoUpdater } = await loadUpdaterModule()
    setupAutoUpdater(fakeWindow())

    expect(getRemoteServerUpdateSupport()).toEqual({
      installMode: 'interactive',
      automatic: false,
      reason: 'unpackaged-build'
    })
  })
})
