import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect } from './orca-app'
import type { ExtraScenarioContext } from './folder-multi-repo-scenario-context'

// S21-S22: the external-change banner's Compare / Keep My Edits on a folder tab, and an agent action's cwd.
export async function runAgentAndBannerScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const { page, R, H, folderKey, scenario, shot, expandOnly, wtIdByPath } = ctx

  await scenario('S21 Banner Compare and Keep My Edits on a folder tab', async (ev) => {
    const rel = 'README.md'
    const abs = path.join(R.api, rel)
    const local = 'LOCAL-EDIT-S21'
    const disk = 'DISK-EDIT-S21'
    await page.evaluate(() => window.__store!.getState().updateSettings({ editorAutoSave: false }))
    const fileId = await page.evaluate(
      ({ filePath, relativePath, worktreeId, gitWorktreeId }) => {
        const s = window.__store!.getState()
        // Why: earlier scenarios leave tabs and a split group; the one editor on screen must be this tab's.
        s.closeAllFiles()
        s.openFile({
          filePath,
          relativePath,
          worktreeId,
          gitWorktreeId: gitWorktreeId ?? undefined,
          language: 'markdown',
          mode: 'edit'
        })
        const id = window
          .__store!.getState()
          .openFiles.find((f) => f.filePath === filePath && f.mode === 'edit')?.id
        if (!id) {
          throw new Error('edit tab did not open')
        }
        window.__store!.getState().setMarkdownViewMode(id, 'source')
        return id
      },
      {
        filePath: abs,
        relativePath: rel,
        worktreeId: folderKey,
        gitWorktreeId: await wtIdByPath(R.api)
      }
    )
    const editor = page.locator('.monaco-editor').first()
    await expect(editor).toBeVisible({ timeout: 25_000 })
    await editor.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(`\n${local}`)
    const isDirty = () =>
      page.evaluate(
        (id) => window.__store!.getState().openFiles.find((f) => f.id === id)?.isDirty ?? null,
        fileId
      )
    await expect.poll(isDirty).toBe(true)
    // Setup guard: the edit must still be unsaved when the disk changes, or no banner is owed.
    expect(readFileSync(abs, 'utf8')).not.toContain(local)
    writeFileSync(abs, `${readFileSync(abs, 'utf8')}${disk}\n`)
    const banner = page.getByRole('alert').filter({ hasText: /changed on disk/ })
    await expect(banner).toBeVisible({ timeout: 15_000 })

    await banner.getByRole('button', { name: 'Compare' }).click()
    const compare = page.getByRole('dialog').filter({ hasText: 'File changed on disk' })
    await expect(compare).toBeVisible()
    await expect(compare.locator('.original-in-monaco-diff-editor .view-lines')).toContainText(disk)
    await expect(compare.locator('.modified-in-monaco-diff-editor .view-lines')).toContainText(
      local
    )
    await shot('S21a-compare')
    await compare.getByRole('button', { name: 'Keep My Edits' }).click()
    await expect(compare).toHaveCount(0)
    await expect(banner).toHaveCount(0, { timeout: 15_000 })
    // Keep only dismisses; the disk keeps the other writer's version until the user saves.
    expect(readFileSync(abs, 'utf8')).toContain(disk)

    await editor.click()
    await page.keyboard.press('ControlOrMeta+S')
    await expect.poll(() => readFileSync(abs, 'utf8'), { timeout: 15_000 }).toContain(local)
    expect(readFileSync(abs, 'utf8')).not.toContain(disk)
    await expect.poll(isDirty).toBe(false)
    ev.push(`saved after Keep: ${JSON.stringify(readFileSync(abs, 'utf8'))}`)
    await shot('S21b-kept-and-saved')
  })

  await scenario('S22 Explain changes starts the agent in the repo, not the folder', async (ev) => {
    const stage = mkdtempSync(path.join(os.tmpdir(), 'orca-s22-'))
    const marker = path.join(stage, 'cwd.txt')
    const fakeAgent = path.join(stage, 'fake-agent')
    // The agent only records where it was started; nothing real runs.
    writeFileSync(fakeAgent, `#!/bin/sh\npwd -P > '${marker}'\n`)
    chmodSync(fakeAgent, 0o755)
    try {
      await page.evaluate(
        (command) =>
          window.__store!.getState().updateSettings({
            agentCmdOverrides: { claude: command, codex: command }
          }),
        fakeAgent
      )
      await expandOnly(H.api)
      const commitRow = page.getByTestId('git-history-row').filter({ hasText: 'local-2' })
      if ((await commitRow.count()) === 0) {
        await page
          .getByRole('button', { name: /^Commits/ })
          .first()
          .click()
      }
      await expect(commitRow).toBeVisible({ timeout: 15_000 })
      await commitRow.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Explain changes' }).click()
      await expect.poll(() => existsSync(marker), { timeout: 30_000 }).toBe(true)
      const cwd = readFileSync(marker, 'utf8').trim()
      ev.push(`agent cwd: ${cwd}`)
      expect(cwd).toBe(realpathSync(R.api))
      // The agent tab belongs to the folder workspace the user is in.
      await expect
        .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
        .toBe(folderKey)
      await shot('S22-agent-tab')
    } finally {
      await page.evaluate(() =>
        window.__store!.getState().updateSettings({ agentCmdOverrides: {} })
      )
      rmSync(stage, { recursive: true, force: true })
    }
  })
}
