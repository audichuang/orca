import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { openSourceControlForWorktree } from './helpers/worktree-registration'

// Regression for a one-off "InstantiationService has been disposed" workbench crash: graph file diff
// (preview tab) -> back to the graph -> "Open all changes together" on a many-file commit.

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

function commitFiles(cwd: string, files: Record<string, string>, message: string): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), content)
    git(cwd, ['add', file])
  }
  git(cwd, ['commit', '-m', message])
}

async function seedWorktree(
  testRepoPath: string,
  register: (cleanup: () => Promise<void>) => void
): Promise<string> {
  const branch = `e2e-open-all-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const worktreePath = path.join(os.tmpdir(), branch)
  git(testRepoPath, ['worktree', 'add', worktreePath, '-b', branch])
  register(async () => {
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
  const eight: Record<string, string> = {}
  for (let i = 1; i <= 8; i++) {
    eight[`src/eight/file-${i}.ts`] = `export const value${i} = ${i}\n`
  }
  commitFiles(worktreePath, eight, 'Add eight files')
  commitFiles(worktreePath, { 'src/auth/login.ts': 'export const login = 1\n' }, 'Add login')
  commitFiles(worktreePath, { 'src/auth/session.ts': 'export const session = 1\n' }, 'Add session')
  return worktreePath
}

function watchWorkbenchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /InstantiationService|disposed/i.test(message.text())) {
      errors.push(message.text())
    }
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

async function expectWorkbenchHealthy(page: Page, errors: string[]): Promise<void> {
  // Why a pause: the crash surfaced after the all-changes tab began loading its diff editors.
  await page.waitForTimeout(2500)
  await expect(page.getByText('The workspace workbench hit an error.')).toHaveCount(0)
  expect(errors.filter((error) => /InstantiationService/.test(error))).toEqual([])
}

test('graph tab: file diff, back, then Open all changes together keeps the workbench alive', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(240_000)
  const worktreePath = await seedWorktree(testRepoPath, registerPostElectronShutdownCleanup)
  const errors = watchWorkbenchErrors(orcaPage)
  await orcaPage.setViewportSize({ width: 1600, height: 1000 })
  await waitForSessionReady(orcaPage)
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)

  await orcaPage.keyboard.press('ControlOrMeta+Shift+H')
  const graph = orcaPage.locator('[data-git-graph-root]')
  await expect(graph).toBeVisible({ timeout: 15_000 })
  const graphTab = orcaPage.locator('[data-tab-id]').filter({ hasText: 'Git Graph' })
  const rows = graph.getByTestId('git-graph-full-row')
  const files = graph.getByTestId('git-history-commit-file')
  await expect(rows.filter({ hasText: 'Add session' })).toBeVisible({ timeout: 15_000 })

  for (let round = 0; round < 3; round++) {
    await rows.filter({ hasText: 'Add session' }).click()
    await rows.filter({ hasText: 'Add login' }).click({ modifiers: ['ControlOrMeta'] })
    await expect(graph.getByText('Changed files (2) · 2 commits')).toBeVisible()
    for (const name of ['login.ts', 'session.ts']) {
      await files.filter({ hasText: name }).click()
      await expect(orcaPage.locator('.monaco-diff-editor').first()).toBeVisible({
        timeout: 20_000
      })
      await graphTab.click()
      await expect(graph).toBeVisible()
    }
    await rows.filter({ hasText: 'Add eight files' }).click()
    await expect(files).toHaveCount(8, { timeout: 15_000 })
    await graph.getByRole('button', { name: 'Open all changes together' }).click()
    await expect(orcaPage.locator('.monaco-diff-editor').first()).toBeVisible({ timeout: 20_000 })
    await expectWorkbenchHealthy(orcaPage, errors)
    await graphTab.click()
    await expect(graph).toBeVisible()
  }
})

test('sidebar Commits: file diff, then Open all changes together keeps the workbench alive', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(240_000)
  const worktreePath = await seedWorktree(testRepoPath, registerPostElectronShutdownCleanup)
  const errors = watchWorkbenchErrors(orcaPage)
  await orcaPage.setViewportSize({ width: 1600, height: 1000 })
  await waitForSessionReady(orcaPage)
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)
  const historyRows = orcaPage.getByTestId('git-history-row')
  if (
    !(await historyRows
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await orcaPage.getByRole('button', { name: /^Commits/ }).click()
  }
  await expect(historyRows.first()).toBeVisible({ timeout: 15_000 })
  const files = orcaPage.getByTestId('git-history-commit-file')

  for (let round = 0; round < 3; round++) {
    for (const [subject, name] of [
      ['Add session', 'session.ts'],
      ['Add login', 'login.ts']
    ] as const) {
      await historyRows.filter({ hasText: subject }).first().click()
      await files.filter({ hasText: name }).first().click()
      await expect(orcaPage.locator('.monaco-diff-editor').first()).toBeVisible({
        timeout: 20_000
      })
      // Collapse it again so the next commit's files are the only ones listed.
      await historyRows.filter({ hasText: subject }).first().click()
    }
    await historyRows.filter({ hasText: 'Add eight files' }).first().click()
    await expect(files).toHaveCount(8, { timeout: 15_000 })
    await orcaPage.getByRole('button', { name: 'Open all changes together' }).click()
    await expect(orcaPage.locator('.monaco-diff-editor').first()).toBeVisible({ timeout: 20_000 })
    await expectWorkbenchHealthy(orcaPage, errors)
    await historyRows.filter({ hasText: 'Add eight files' }).first().click()
  }
})
