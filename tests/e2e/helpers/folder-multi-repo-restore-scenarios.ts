import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { expect } from './orca-app'
import type { ExtraScenarioContext } from './folder-multi-repo-scenario-context'

// S12-S14: restore safety (symlink escapes, size-skip placeholders, pending editor edits).
export async function runRestoreScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const { page, P, R, folderKey, scenario, shot, setClipboard, wtIdByPath } = ctx
  // ---- restore helpers shared by S12-S14 ----
  const dialogLocator = () => page.getByRole('dialog')
  const openRestoreDialog = async (payload: string) => {
    await setClipboard(page, payload)
    await page.getByRole('button', { name: 'Paste & Restore' }).first().click()
    await expect(dialogLocator()).toBeVisible({ timeout: 15_000 })
    return dialogLocator()
  }
  const skipSection = async (dialog: ReturnType<typeof dialogLocator>) =>
    (await dialog.innerText()).replace(/\n+/g, '\n').split(/^Skip \(/m)[1] ?? ''
  const resultToast = (re: RegExp) => page.locator('[data-sonner-toast]').filter({ hasText: re })
  const walkFiles = (dir: string, name: string): string[] => {
    const hits: string[] = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      // Symlinks are not followed: outside-link points back at the fixture root.
      if (e.isSymbolicLink()) {
        if (e.name === name) {
          hits.push(path.join(dir, e.name))
        }
      } else if (e.isDirectory() && e.name !== '.git') {
        hits.push(...walkFiles(path.join(dir, e.name), name))
      } else if (e.name === name) {
        hits.push(path.join(dir, e.name))
      }
    }
    return hits
  }

  await scenario('S12 Restore refuses a symlink escape', async (ev) => {
    const fixtureDir = path.dirname(P)
    expect(lstatSync(path.join(R.webapp, 'git-alias')).isSymbolicLink()).toBe(true)
    expect(lstatSync(path.join(R.webapp, 'outside-link')).isSymbolicLink()).toBe(true)
    expect(realpathSync(path.join(R.webapp, 'outside-link'))).toBe(realpathSync(fixtureDir))
    const gitConfig = path.join(R.webapp, '.git', 'config')
    const configBefore = readFileSync(gitConfig)
    const payload = [
      '// clipcode-root: MultiProduct',
      '// file: [MODIFIED] WebApp/git-alias/config',
      '[core]\n\tpwned = true',
      '',
      '// file: [NEW] WebApp/outside-link/pwned.txt',
      'pwned',
      '',
      '// file: [NEW] WebApp/src/restored/s12-ok.ts',
      'export const s12 = 1',
      ''
    ].join('\n')
    const dialog = await openRestoreDialog(payload)
    const skip = await skipSection(dialog)
    ev.push(`skip block: ${JSON.stringify(skip)}`)
    expect(skip).toMatch(/^2\)/)
    expect(skip).toMatch(/path goes through a symlink\s+WebApp\/git-alias\/config/)
    expect(skip).toMatch(/path goes through a symlink\s+WebApp\/outside-link\/pwned\.txt/)
    await shot('S12-symlink-escape-dialog')
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 15_000 })
    await expect(resultToast(/Created 1, overwritten 0, deleted 0, skipped 2\./)).toHaveCount(1, {
      timeout: 10_000
    })
    await expect
      .poll(() => existsSync(path.join(R.webapp, 'src/restored/s12-ok.ts')), { timeout: 15_000 })
      .toBe(true)
    expect(readFileSync(gitConfig).equals(configBefore)).toBe(true)
    expect(walkFiles(fixtureDir, 'pwned.txt')).toEqual([])
    ev.push('.git/config byte-identical; no pwned.txt under the fixture tree; legit entry created')
    await shot('S12-symlink-escape-result')
  })

  await scenario('S13 Size-skip placeholder never overwrites', async (ev) => {
    // Why: S12's identical result toast may still be on screen and would satisfy the wait below early.
    await expect(resultToast(/skipped 2\./)).toHaveCount(0, { timeout: 20_000 })
    const readme = path.join(R.webapp, 'README.md')
    const before = readFileSync(readme)
    const newPath = path.join(R.webapp, 'src/restored/s13-skipped.ts')
    const payload = [
      '// clipcode-root: MultiProduct',
      '// file: [MODIFIED] WebApp/README.md',
      '// File skipped: size exceeds limit (3000000 bytes)',
      '',
      '// file: [NEW] WebApp/src/restored/s13-skipped.ts',
      '// File skipped: size exceeds limit (3000000 bytes)',
      '',
      '// file: [NEW] WebApp/src/restored/s13-ok.ts',
      'export const s13 = 1',
      ''
    ].join('\n')
    const dialog = await openRestoreDialog(payload)
    const text = (await dialog.innerText()).replace(/\n+/g, '\n')
    ev.push(`dialog: ${JSON.stringify(text)}`)
    expect(text).toMatch(/Skip \(2\)/)
    expect(text).toMatch(/content was skipped when copied\s+WebApp\/README\.md/)
    expect(text).toMatch(/content was skipped when copied\s+WebApp\/src\/restored\/s13-skipped\.ts/)
    // README must not be offered as an overwrite either.
    expect(text).not.toMatch(/Overwrite \(/)
    await shot('S13-size-skip-dialog')
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 15_000 })
    await expect(resultToast(/Created 1, overwritten 0, deleted 0, skipped 2\./)).toHaveCount(1, {
      timeout: 10_000
    })
    await expect
      .poll(() => existsSync(path.join(R.webapp, 'src/restored/s13-ok.ts')), { timeout: 15_000 })
      .toBe(true)
    expect(readFileSync(readme).equals(before)).toBe(true)
    expect(existsSync(newPath)).toBe(false)
    expect(existsSync(path.join(R.webapp, 'src/restored/s13-ok.ts'))).toBe(true)
    ev.push('README.md byte-identical, placeholder-only new file not created, real entry created')
  })

  await scenario('S14 Restore over an editor tab with pending edits', async (ev) => {
    const rel = 'src/restored/a.ts'
    const abs = path.join(R.webapp, rel)
    const webWt = await wtIdByPath(R.webapp)
    const marker = '// UNSAVED-EDIT-S14'
    const restored = 'export const restored = 14\n'
    // Longest allowed delay: the pending autosave timer must still be armed while the restore runs.
    await page.evaluate(() =>
      window
        .__store!.getState()
        .updateSettings({ editorAutoSave: true, editorAutoSaveDelayMs: 10_000 })
    )
    const onDisk = () => readFileSync(abs, 'utf8')
    const diskBefore = onDisk()
    await page.evaluate(
      ({ filePath, relativePath, worktreeId, gitWorktreeId }) =>
        window.__store!.getState().openFile({
          filePath,
          relativePath,
          worktreeId,
          gitWorktreeId: gitWorktreeId ?? undefined,
          language: 'typescript',
          mode: 'edit'
        }),
      { filePath: abs, relativePath: rel, worktreeId: folderKey, gitWorktreeId: webWt }
    )
    const monaco = page.locator('.monaco-editor').first()
    await expect(monaco).toBeVisible({ timeout: 25_000 })
    await monaco.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(`\n${marker}`)
    const fileState = () =>
      page.evaluate(
        (p) => window.__store!.getState().openFiles.find((f) => f.filePath === p)?.isDirty ?? null,
        abs
      )
    await expect.poll(fileState, { timeout: 10_000 }).toBe(true)
    expect(onDisk()).toBe(diskBefore)
    await shot('S14a-dirty-editor')
    const dialog = await openRestoreDialog(
      `// clipcode-root: MultiProduct\n// file: [MODIFIED] WebApp/${rel}\n${restored}\n`
    )
    await dialog.getByLabel('Overwrite existing files').click()
    // Setup guard: the edit must still be unsaved when Restore is clicked, or the test proves nothing.
    expect(onDisk()).not.toContain(marker)
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 15_000 })
    await expect(resultToast(/overwritten 1/)).toHaveCount(1, { timeout: 10_000 })
    await expect.poll(onDisk, { timeout: 15_000 }).toContain('restored = 14')
    // Outlive the armed autosave timer (10 s) before judging the final content.
    await page.waitForTimeout(12_500)
    const finalText = onDisk()
    ev.push(
      `final disk: ${JSON.stringify(finalText)} isDirty=${await fileState()} externalMutation=${await page.evaluate((p) => window.__store!.getState().openFiles.find((f) => f.filePath === p)?.externalMutation ?? null, abs)}`
    )
    expect(finalText).toContain('restored = 14')
    expect(finalText).not.toContain(marker)
    await shot('S14b-after-restore')
    await page.evaluate(() => window.__store!.getState().updateSettings({ editorAutoSave: false }))
  })
}
