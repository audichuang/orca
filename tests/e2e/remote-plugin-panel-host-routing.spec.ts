// Fork: a plugin panel shows the data of the host that owns the focused workspace. The client keeps
// its own copy of the panel UI (with its own script files) and sends the panel's host calls to the
// same plugin on the paired server.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient,
  type PairedElectronClient
} from './helpers/paired-electron-client'
import { ISOLATED_FRAMES_E2E, pluginGuest, readInGuest } from './helpers/plugin-frame-guest'
import { enableDevPlugins } from './helpers/plugin-smoke'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.use(ISOLATED_FRAMES_E2E)

const PANEL_TITLE = 'Host Marker'

/** Same id and version on both machines; only the worker's answer differs. */
async function writeMarkerPlugin(root: string, marker: string): Promise<string> {
  const dir = join(root, marker)
  await mkdir(join(dir, 'panel'), { recursive: true })
  await writeFile(
    join(dir, 'orca-plugin.json'),
    JSON.stringify({
      manifestVersion: 2,
      execution: 'trusted-worker',
      id: 'host-marker',
      name: 'Host Marker',
      version: '1.0.0',
      engines: { orca: '>=1.4.248' },
      pluginApi: 1,
      main: 'worker.mjs',
      contributes: {
        panels: [{ id: 'main', title: PANEL_TITLE, icon: 'activity', entry: 'panel/index.html' }]
      },
      capabilities: []
    })
  )
  await writeFile(
    join(dir, 'worker.mjs'),
    `export default function activate(orca) {
  orca.panels.handle('whoami', async () => ({ host: ${JSON.stringify(marker)} }))
}\n`
  )
  // A separate script file, as real panels have: the srcdoc fallback a server sends cannot load it.
  await writeFile(
    join(dir, 'panel', 'index.html'),
    '<!doctype html><html><body><main id="out">waiting</main><script src="app.js"></script></body></html>\n'
  )
  await writeFile(
    join(dir, 'panel', 'app.js'),
    `function ask() {
  window.orca.plugin.request('whoami', {}).then(
    (r) => { document.getElementById('out').textContent = r.host },
    (e) => { document.getElementById('out').textContent = 'error: ' + e.message }
  )
}
ask()
setInterval(ask, 1000)\n`
  )
  return dir
}

async function focusWorkspace(page: Page, worktreeId: string, hostId: string): Promise<void> {
  await page.evaluate(
    ({ id, host }) => {
      const state = window.__store!.getState()
      state.closeSettingsPage()
      state.setActiveWorktree(id, host as never)
      if (!state.rightSidebarOpen) {
        state.toggleRightSidebar()
      }
    },
    { id: worktreeId, host: hostId }
  )
}

function readMarker(page: Page): Promise<string | null> {
  return readInGuest<string>(
    pluginGuest(page, PANEL_TITLE),
    `document.getElementById('out')?.textContent ?? null`
  )
}

test('a plugin panel follows the host of the focused workspace', async ({
  orcaPage,
  testRepoPath
}, testInfo) => {
  // Launching and pairing a second Electron client takes most of this budget.
  test.setTimeout(300_000)
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  const root = await mkdtemp(join(tmpdir(), 'orca-e2e-host-marker-'))
  let client: PairedElectronClient | null = null
  try {
    await enableDevPlugins(orcaPage, [await writeMarkerPlugin(root, 'server')])
    client = await launchPairedElectronClient(
      await createRuntimeDesktopPairingOffer(orcaPage),
      testInfo,
      'Remote plugin panel',
      { extraEnv: ISOLATED_FRAMES_E2E.orcaAppExtraEnv }
    )
    const { page, environmentId } = client
    await enableDevPlugins(page, [await writeMarkerPlugin(root, 'client')])

    const findRemoteWorktreeId = (): Promise<string | null> =>
      page.evaluate(
        (repoPath) =>
          window.__store
            ?.getState()
            .allWorktrees()
            .find((worktree) => worktree.path === repoPath)?.id ?? null,
        testRepoPath
      )
    await expect.poll(findRemoteWorktreeId, { timeout: 120_000 }).not.toBeNull()
    const remoteWorktreeId = (await findRemoteWorktreeId())!
    const localWorktreeId = await page.evaluate(async (repoPath) => {
      const store = window.__store!
      await store.getState().setActiveRuntimeEnvironmentPreference(null)
      const added = await window.api.repos.add({ path: repoPath })
      if ('error' in added) {
        throw new Error(added.error)
      }
      await store.getState().fetchReposForAllHosts()
      await store.getState().fetchWorktrees(added.repo.id, { forceLocalOwner: true })
      store.getState().setVisibleWorkspaceHostIds(null)
      const worktree = store
        .getState()
        .worktreesByRepo[added.repo.id]?.find((row) => row.isMainWorktree)
      if (!worktree) {
        throw new Error('Local checkout missing')
      }
      return worktree.id
    }, testRepoPath)

    await focusWorkspace(page, remoteWorktreeId, `runtime:${environmentId}`)
    await page.getByRole('button', { name: PANEL_TITLE, exact: true }).click()
    await expect.poll(() => readMarker(page), { timeout: 30_000 }).toBe('server')
    await page.screenshot({ path: testInfo.outputPath('remote-workspace.png') })

    await focusWorkspace(page, localWorktreeId, 'local')
    await expect.poll(() => readMarker(page), { timeout: 30_000 }).toBe('client')
    await page.screenshot({ path: testInfo.outputPath('local-workspace.png') })

    await focusWorkspace(page, remoteWorktreeId, `runtime:${environmentId}`)
    await expect.poll(() => readMarker(page), { timeout: 30_000 }).toBe('server')
  } finally {
    await client?.dispose()
    await rm(root, { recursive: true, force: true })
  }
})
