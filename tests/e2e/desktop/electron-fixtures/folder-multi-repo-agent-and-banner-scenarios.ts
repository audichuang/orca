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
import {
  openRepoEditTabInFolder,
  type ExtraScenarioContext
} from './folder-multi-repo-scenario-context'

// S21-S22: the external-change banner's Compare / Keep My Edits on a folder tab, and an agent action's cwd.
// S22 follows upstream: a card's agent action opens in the repo's own workspace (the fork's guard that kept it in
// the folder went with the fork folder panel).
export async function runAgentAndBannerScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const { page, R, H, folderKey, scenario, shot, expandOnly, wtIdByPath } = ctx

  await scenario('S21 Banner Compare and Keep My Edits on a folder tab', async (ev) => {
    const rel = 'README.md'
    const abs = path.join(R.api, rel)
    const local = 'LOCAL-EDIT-S21'
    const disk = 'DISK-EDIT-S21'
    await page.evaluate(() => window.__store!.getState().updateSettings({ editorAutoSave: false }))
    const fileId = await openRepoEditTabInFolder(
      page,
      { filePath: abs, relativePath: rel, ownerWorktreeId: (await wtIdByPath(R.api))!, folderKey },
      'markdown'
    )
    await page.evaluate(
      (id) => window.__store!.getState().setMarkdownViewMode(id, 'source'),
      fileId
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
    // Why :not(.line-delete): an inline diff (narrow window) renders deleted lines in a view zone that also has .view-lines.
    await expect(
      compare.locator('.modified-in-monaco-diff-editor .view-lines:not(.line-delete)')
    ).toContainText(local)
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

  await scenario('S22 Explain changes starts the agent in the repo', async (ev) => {
    const stage = mkdtempSync(path.join(os.tmpdir(), 'orca-s22-'))
    const marker = path.join(stage, 'cwd.txt')
    const fakeAgent = path.join(stage, 'fake-agent')
    // The agent only records where it was started; nothing real runs.
    writeFileSync(fakeAgent, `#!/bin/sh\npwd -P > '${marker}'\n`)
    chmodSync(fakeAgent, 0o755)
    try {
      await page.evaluate(async (command) => {
        const store = window.__store!
        await store.getState().updateSettings({
          defaultTuiAgent: 'claude',
          agentCmdOverrides: { claude: `'${command}'` }
        })
        // Why: CI has no agent CLI on PATH; seed the detection cache so the launch picks claude and runs the override.
        store.setState((s) => ({
          detectedAgentIds: ['claude'],
          localDetectedAgentIdsByContext: Object.fromEntries(
            Object.keys(s.localDetectedAgentIdsByContext).map((key) => [key, ['claude']])
          )
        }))
      }, fakeAgent)
      await expandOnly(H.api)
      const commitRow = ctx
        .card(H.api)
        .getByTestId('git-history-row')
        .filter({ hasText: 'local-2' })
      if ((await commitRow.count()) === 0) {
        await ctx
          .card(H.api)
          .getByRole('button', { name: /^Commits/ })
          .first()
          .click()
      }
      await expect(commitRow).toBeVisible({ timeout: 15_000 })
      await commitRow.click({ button: 'right' })
      const apiWt = (await wtIdByPath(R.api))!
      const terminalTabs = () =>
        page.evaluate(
          (id) =>
            (window.__store!.getState().unifiedTabsByWorktree[id] ?? []).filter(
              (t) => t.contentType === 'terminal'
            ).length,
          apiWt
        )
      const before = await terminalTabs()
      await page.getByRole('menuitem', { name: 'Explain changes' }).click()
      await expect.poll(terminalTabs, { timeout: 30_000 }).toBe(before + 1)
      // The agent's terminal starts once its workspace is shown.
      await page
        .locator(
          `[data-worktree-sidebar] [role="option"][data-worktree-id=${JSON.stringify(apiWt)}]`
        )
        .click()
      // Why: the first agent launch in a repo asks once whether Orca should answer agents' folder-trust prompts.
      const trustDialog = page.getByRole('dialog').filter({ hasText: /^Trust .* for agents\?/ })
      await expect
        .poll(async () => existsSync(marker) || (await trustDialog.isVisible()), {
          timeout: 30_000
        })
        .toBe(true)
      if (!existsSync(marker)) {
        await trustDialog.getByRole('button', { name: 'Let agents ask' }).click()
      }
      await expect.poll(() => existsSync(marker), { timeout: 30_000 }).toBe(true)
      const cwd = readFileSync(marker, 'utf8').trim()
      ev.push(`agent cwd: ${cwd}`)
      expect(cwd).toBe(realpathSync(R.api))
      await shot('S22-agent-tab')
      // Later scenarios run in the folder workspace.
      await page
        .locator(
          `[data-worktree-sidebar] [role="option"][data-worktree-id=${JSON.stringify(folderKey)}]`
        )
        .click()
    } finally {
      await page.evaluate(() =>
        window.__store!.getState().updateSettings({ agentCmdOverrides: {} })
      )
      rmSync(stage, { recursive: true, force: true })
    }
  })
}
