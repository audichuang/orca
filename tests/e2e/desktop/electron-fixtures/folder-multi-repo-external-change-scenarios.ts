import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from './orca-app'
import {
  openRepoEditTabInFolder,
  type ExtraScenarioContext
} from './folder-multi-repo-scenario-context'

// S20: the external-change banner over an edit tab in Changes mode.
export async function runExternalChangeScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const { page, R, folderKey, scenario, shot, wtIdByPath } = ctx
  await scenario('S20 Changes view stays visible under the external-change banner', async (ev) => {
    const rel = 'server.ts'
    const abs = path.join(R.api, rel)
    const marker = 'UNSAVED-EDIT-S20'
    await page.evaluate(() => window.__store!.getState().updateSettings({ editorAutoSave: false }))
    const fileId = await openRepoEditTabInFolder(
      page,
      { filePath: abs, relativePath: rel, ownerWorktreeId: (await wtIdByPath(R.api))!, folderKey },
      'typescript'
    )
    await page.evaluate((id) => window.__store!.getState().setEditorViewMode(id, 'changes'), fileId)
    const diffEditor = page.locator('.monaco-diff-editor').first()
    await expect(diffEditor).toBeVisible({ timeout: 25_000 })
    await page.locator('.modified-in-monaco-diff-editor .view-lines').first().click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(`\n// ${marker}`)
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.__store!.getState().openFiles.find((f) => f.id === id)?.isDirty ?? null,
          fileId
        )
      )
      .toBe(true)
    // Setup guard: the edit must still be unsaved when the disk changes, or no banner is owed.
    expect(readFileSync(abs, 'utf8')).not.toContain(marker)
    writeFileSync(abs, `${readFileSync(abs, 'utf8')}// DISK-EDIT-S20\n`)
    await expect(page.getByRole('alert').filter({ hasText: /changed on disk/ })).toBeVisible({
      timeout: 15_000
    })
    await expect(diffEditor).toBeVisible()
    const box = await diffEditor.boundingBox()
    ev.push(`diff editor box under the banner: ${JSON.stringify(box)}`)
    expect(box?.height ?? 0).toBeGreaterThan(100)
    await expect(page.locator('.modified-in-monaco-diff-editor .view-lines').first()).toContainText(
      marker
    )
    await shot('S20-changes-view-under-banner')
    await page.getByRole('button', { name: 'Reload from Disk' }).first().click()
    await expect(page.getByRole('alert').filter({ hasText: /changed on disk/ })).toHaveCount(0, {
      timeout: 15_000
    })
  })
}
