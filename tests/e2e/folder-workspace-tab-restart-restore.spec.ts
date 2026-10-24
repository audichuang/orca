/**
 * A folder workspace's edit tab keeps its repo (git owner) across an app restart.
 *
 * Why E2E: the git owner rides the saved layout and session, is re-read on the
 * next launch and only then feeds the tab's Changes view. A broken hop leaves
 * the tab open but resolving git against the folder, which is not a repo, so
 * the Changes view shows no diff. Store and unit tests cannot cross the restart.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { createRestartSession } from './helpers/orca-restart'
import { importMultiProductFolder } from './helpers/folder-multi-repo-import'

const FIXTURE_SCRIPT = path.join(__dirname, 'helpers', 'folder-multi-repo-fixture.sh')

async function openFolderWorkspace(page: Page, folderKey: string): Promise<void> {
  await page
    .locator(
      `[data-worktree-sidebar] [role="option"][data-worktree-id=${JSON.stringify(folderKey)}]`
    )
    .click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
    .toBe(folderKey)
}

function apiWorktreeId(page: Page, apiPath: string): Promise<string | null> {
  return page.evaluate((target) => {
    for (const list of Object.values(window.__store!.getState().worktreesByRepo)) {
      const hit = list.find((w) => w.path === target)
      if (hit) {
        return hit.id
      }
    }
    return null
  }, apiPath)
}

test('a folder edit tab keeps its repo across a restart', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.setTimeout(300_000)
  const fixtureRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-folder-restart-')))
  const P = execFileSync('bash', [FIXTURE_SCRIPT, path.join(fixtureRoot, 'fixture')], {
    encoding: 'utf8'
  }).trim()
  const api = path.join(P, 'api-server')
  const filePath = path.join(api, 'server.ts')
  const session = createRestartSession(testInfo)
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null
  try {
    const first = await session.launch()
    firstApp = first.app
    await waitForSessionReady(first.page)
    const { folderKey } = await importMultiProductFolder(first.page, P)
    await openFolderWorkspace(first.page, folderKey)
    const apiWt = await apiWorktreeId(first.page, api)
    expect(apiWt).toBeTruthy()
    await first.page.evaluate(
      ({ filePath, worktreeId, gitWorktreeId }) =>
        window.__store!.getState().openFile({
          filePath,
          relativePath: 'server.ts',
          worktreeId,
          gitWorktreeId,
          language: 'typescript',
          mode: 'edit'
        }),
      { filePath, worktreeId: folderKey, gitWorktreeId: apiWt! }
    )
    await expect(first.page.locator('.monaco-editor').first()).toBeVisible({ timeout: 25_000 })
    await session.close(firstApp)
    firstApp = null

    const second = await session.launch()
    secondApp = second.app
    const page = second.page
    await waitForSessionReady(page)
    await openFolderWorkspace(page, folderKey)
    const restored = await page.evaluate(
      (target) =>
        window
          .__store!.getState()
          .openFiles.filter((f) => f.filePath === target && f.mode === 'edit')
          .map((f) => ({ id: f.id, worktreeId: f.worktreeId, gitWorktreeId: f.gitWorktreeId })),
      filePath
    )
    expect(restored).toEqual([
      { id: expect.any(String), worktreeId: folderKey, gitWorktreeId: apiWt }
    ])
    await page.evaluate((id) => {
      const s = window.__store!.getState()
      s.setActiveFile(id)
      s.setEditorViewMode(id, 'changes')
    }, restored[0].id)
    // User-visible proof: the Changes view diffs against api-server's HEAD, which only the git owner names.
    const modified = page.locator('.modified-in-monaco-diff-editor .view-lines').first()
    await expect(modified).toContainText('unstaged api', { timeout: 25_000 })
    const original = page.locator('.original-in-monaco-diff-editor .view-lines').first()
    // HEAD holds both local commits; a diff against the index-less folder or a stale blob would not.
    await expect(original).toContainText('local 2')
    await expect(original).toContainText('local 1')
    await expect(original).not.toContainText('unstaged api')
  } finally {
    for (const app of [secondApp, firstApp]) {
      if (!app) {
        continue
      }
      try {
        await session.close(app)
      } catch {
        // best-effort cleanup
      }
    }
    await session.dispose()
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
