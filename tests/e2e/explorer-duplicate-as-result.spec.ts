// Fork-only: the explorer's "Duplicate as _result.txt" copies the file byte for byte and shows it in the tree.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { openFileExplorer } from './helpers/file-explorer'
import { waitForSessionReady } from './helpers/store'
import { openSourceControlForWorktree } from './helpers/worktree-registration'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

// CRLF, non-ASCII and a NUL byte: a text-mode or re-encoding copy would not be identical.
const FIXTURE_BYTES = Buffer.from([
  ...Buffer.from('select 1;\r\n-- café 中文\r\n', 'utf8'),
  0,
  0xff
])

async function duplicateAsResult(page: Page, row: Locator): Promise<void> {
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate as _result.txt' }).click()
}

test('Duplicate as _result.txt copies identical bytes and lists the copy, also inside a watcher-ignored dist/', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const branch = `e2e-duplicate-result-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const worktreePath = path.join(os.tmpdir(), branch)
  git(testRepoPath, ['worktree', 'add', worktreePath, '-b', branch])
  registerPostElectronShutdownCleanup(async () => {
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
  mkdirSync(path.join(worktreePath, 'dist'), { recursive: true })
  writeFileSync(path.join(worktreePath, 'query.sql'), FIXTURE_BYTES)
  writeFileSync(path.join(worktreePath, 'dist/bundle.sql'), FIXTURE_BYTES)

  await waitForSessionReady(orcaPage)
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)
  await openFileExplorer(orcaPage)
  const explorer = orcaPage.locator('[data-orca-explorer-shell]')
  const row = (name: string): Locator =>
    explorer
      .locator('[data-file-explorer-row]')
      .filter({
        has: orcaPage.locator('[data-file-explorer-row-name]', { hasText: name })
      })
      .first()
  const nameCells = (name: string): Locator =>
    explorer.locator('[data-file-explorer-row-name]', { hasText: name })

  await expect(row('query.sql')).toBeVisible({ timeout: 20_000 })
  await duplicateAsResult(orcaPage, row('query.sql'))
  const rootCopy = path.join(worktreePath, 'query.sql_result.txt')
  await expect.poll(() => existsSync(rootCopy), { timeout: 10_000 }).toBe(true)
  expect(readFileSync(rootCopy).equals(FIXTURE_BYTES)).toBe(true)
  await expect(nameCells('query.sql_result.txt')).toBeVisible({ timeout: 10_000 })

  // dist/ is in WATCHER_IGNORE_DIRS, so only the explicit refresh after the copy can list the new file.
  await row('dist').click()
  await expect(row('bundle.sql')).toBeVisible({ timeout: 10_000 })
  await duplicateAsResult(orcaPage, row('bundle.sql'))
  const distCopy = path.join(worktreePath, 'dist/bundle.sql_result.txt')
  await expect.poll(() => existsSync(distCopy), { timeout: 10_000 }).toBe(true)
  expect(readFileSync(distCopy).equals(FIXTURE_BYTES)).toBe(true)
  await expect(nameCells('bundle.sql_result.txt')).toBeVisible({ timeout: 10_000 })
})
