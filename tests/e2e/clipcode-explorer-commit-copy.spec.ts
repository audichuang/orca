// Fork-only: ClipCode Copy Full Source from the file explorer and from a multi-selection of commit files.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { openFileExplorer } from './helpers/file-explorer'
import { clipboardText, setClipboard } from './helpers/folder-multi-repo-scenario-context'
import { waitForSessionReady } from './helpers/store'
import { openSourceControlForWorktree } from './helpers/worktree-registration'

const SHOTS_DIR = process.env.ORCA_E2E_SHOTS_DIR ?? path.join(os.tmpdir(), 'orca-clipcode-shots')
// Why both: the selection modifier is Cmd on macOS and Ctrl elsewhere.
const MULTI_SELECT = process.platform === 'darwin' ? 'Meta' : 'Control'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
}

function createWorktree(
  testRepoPath: string,
  label: string,
  registerCleanup: (cleanup: () => Promise<void>) => void
): string {
  const branch = `e2e-clipcode-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const worktreePath = path.join(os.tmpdir(), branch)
  git(testRepoPath, ['worktree', 'add', worktreePath, '-b', branch])
  registerCleanup(async () => {
    try {
      git(testRepoPath, ['worktree', 'remove', '--force', worktreePath])
    } catch {
      rmSync(worktreePath, { recursive: true, force: true })
      git(testRepoPath, ['worktree', 'prune'])
    }
    try {
      git(testRepoPath, ['branch', '-D', branch])
    } catch {}
  })
  return worktreePath
}

async function copyFromMenu(page: Page, row: Locator): Promise<string> {
  await setClipboard(page, 'sentinel')
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy Full Source' }).click()
  await expect.poll(() => clipboardText(page), { timeout: 20_000 }).not.toBe('sentinel')
  return clipboardText(page)
}

test('explorer Copy Full Source copies a folder recursively and a multi-selection of files', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const worktreePath = createWorktree(testRepoPath, 'explorer', registerPostElectronShutdownCleanup)
  writeFiles(worktreePath, {
    'clip/alpha.ts': 'export const alpha = 1\n',
    'clip/nested/beta.ts': 'export const beta = 2\n',
    'clip/node_modules/dep/index.js': 'module.exports = 1\n',
    'clip-other/gamma.ts': 'export const gamma = 3\n',
    // A label mid-path is plain text to the parser, so this one restores as itself and is copied.
    'clip-other/[DELETED] kept.ts': 'kept\n',
    // At the root the header would read back as "delete victim.ts" on Paste & Restore.
    '[DELETED] victim.ts': 'must not be copied\n'
  })
  writeFileSync(path.join(worktreePath, 'clip/blob.bin'), Buffer.from([0, 1, 2, 3]))

  mkdirSync(SHOTS_DIR, { recursive: true })
  await waitForSessionReady(orcaPage)
  // Activates the worktree; the explorer tab is opened right after.
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)
  await openFileExplorer(orcaPage)
  const explorer = orcaPage.locator('[data-orca-explorer-shell]')
  const row = (name: string): Locator =>
    explorer
      .locator('[data-file-explorer-row]')
      .filter({ has: orcaPage.locator('[data-file-explorer-row-name]', { hasText: name }) })
      .first()
  await expect(row('clip-other')).toBeVisible({ timeout: 20_000 })

  const folderPayload = await copyFromMenu(orcaPage, row('clip'))
  const rootLine = `// clipcode-root: ${path.basename(worktreePath)}`
  expect(folderPayload.split('\n')[0]).toBe(rootLine)
  // Explorer order: sub-folders first, hidden node_modules and binary files left out.
  expect(folderPayload).toBe(
    [
      rootLine,
      '',
      '// file: clip/nested/beta.ts',
      'export const beta = 2\n',
      '',
      '// file: clip/alpha.ts',
      'export const alpha = 1\n',
      '',
      ''
    ].join('\n')
  )
  await expect(
    orcaPage.locator('[data-sonner-toast]').filter({ hasText: /2 file\(s\) copied/ })
  ).toBeVisible({ timeout: 10_000 })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '01-explorer-folder-copied.png') })

  await row('clip-other').click()
  await row('README.md').click({ modifiers: [MULTI_SELECT] })
  await row('[DELETED] victim.ts').click({ modifiers: [MULTI_SELECT] })
  const selectionPayload = await copyFromMenu(orcaPage, row('README.md'))
  expect(selectionPayload).toContain('// file: clip-other/gamma.ts\nexport const gamma = 3\n')
  expect(selectionPayload).toContain('// file: README.md\n')
  expect(selectionPayload).not.toContain('clip/alpha.ts')
  expect(selectionPayload).toContain('// file: clip-other/[DELETED] kept.ts\nkept\n')
  expect(selectionPayload).not.toContain('victim.ts')
  await expect(
    orcaPage.locator('[data-sonner-toast]').filter({ hasText: /1 skipped: unsafe file name/ })
  ).toBeVisible({ timeout: 10_000 })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '03-explorer-selection-copied.png') })
})

test('Ctrl/Cmd-click selects commit files without opening them and copies just those', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const worktreePath = createWorktree(testRepoPath, 'commit', registerPostElectronShutdownCleanup)
  writeFiles(worktreePath, {
    'multi/one.ts': 'export const one = 1\n',
    'multi/two.ts': 'export const two = 2\n',
    'multi/three.ts': 'export const three = 3\n'
  })
  git(worktreePath, ['add', '.'])
  git(worktreePath, ['commit', '-m', 'ClipCode multi-select fixture'])

  mkdirSync(SHOTS_DIR, { recursive: true })
  await waitForSessionReady(orcaPage)
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)
  const historyRows = orcaPage.getByTestId('git-history-row')
  if (
    !(await historyRows
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await orcaPage.getByRole('button', { name: /Commits/ }).click()
  }
  const commitRow = historyRows.filter({ hasText: 'ClipCode multi-select fixture' }).first()
  await expect(commitRow).toBeVisible({ timeout: 20_000 })
  await commitRow.click()
  const files = orcaPage.getByTestId('git-history-commit-file')
  const file = (name: string): Locator => files.filter({ hasText: name }).first()
  await expect(file('three.ts')).toBeVisible({ timeout: 15_000 })

  await file('one.ts').click({ modifiers: [MULTI_SELECT] })
  await file('three.ts').click({ modifiers: [MULTI_SELECT] })
  await expect(files.and(orcaPage.locator('[data-selected]'))).toHaveCount(2)
  // A selection click must not open the diff.
  await expect(orcaPage.locator('.monaco-diff-editor')).toHaveCount(0)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '02-commit-files-selected.png') })

  const payload = await copyFromMenu(orcaPage, file('three.ts'))
  expect(payload).toContain('// file: [NEW] multi/one.ts\nexport const one = 1\n')
  expect(payload).toContain('// file: [NEW] multi/three.ts\nexport const three = 3\n')
  expect(payload).not.toContain('multi/two.ts')
})
