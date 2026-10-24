import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { openSourceControlForWorktree } from './helpers/worktree-registration'

const DEEP_COMMITS = 1100
// Row ~700: past the first pages, inside the 1000-commit cap.
const SIDE_BASE = 400

function git(cwd: string, args: string[], input?: string): string {
  return execFileSync('git', args, { cwd, input, stdio: 'pipe', encoding: 'utf8' })
}

const deepSubject = (n: number): string => `deep ${String(n).padStart(4, '0')}`

/** Imports `deep 0001..1100` onto the branch, a side branch off deep 0400, and a tag-only commit. */
function seedDeepHistory(cwd: string, branch: string, side: string, tag: string): void {
  const head = git(cwd, ['rev-parse', 'HEAD']).trim()
  const base = Math.floor(Date.now() / 1000)
  const data = (text: string): string => `data ${Buffer.byteLength(text)}\n${text}\n`
  const commit = (ref: string, mark: number, at: number, subject: string, from: string): string =>
    `commit ${ref}\nmark :${mark}\ncommitter E2E <e2e@example.test> ${at} +0000\n${data(subject)}` +
    `from ${from}\nM 644 inline deep.txt\n${data(subject)}\n`
  let stream = ''
  for (let n = 1; n <= DEEP_COMMITS; n++) {
    stream += commit(
      `refs/heads/${branch}`,
      n,
      base + n,
      deepSubject(n),
      n === 1 ? head : `:${n - 1}`
    )
  }
  stream += commit(
    `refs/heads/${side}`,
    DEEP_COMMITS + 1,
    base + 5000,
    'side work',
    `:${SIDE_BASE}`
  )
  stream += commit(
    `refs/tags/${tag}`,
    DEEP_COMMITS + 2,
    base + 6000,
    'tag only',
    `:${DEEP_COMMITS}`
  )
  git(cwd, ['fast-import', '--quiet'], stream)
  git(cwd, ['reset', '--quiet', '--hard', branch])
}

test('the Git Graph tab loads pages on scroll, follows an arrow past them, and walks tags on request', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(240_000)
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const branchName = `e2e-graph-deep-${suffix}`
  const sideBranch = `e2e-graph-side-${suffix}`
  const tagName = `e2e-tag-only-${suffix}`
  const worktreePath = path.join(os.tmpdir(), branchName)
  git(testRepoPath, ['worktree', 'add', worktreePath, '-b', branchName])
  registerPostElectronShutdownCleanup(async () => {
    try {
      git(testRepoPath, ['worktree', 'remove', '--force', worktreePath])
    } catch {
      rmSync(worktreePath, { recursive: true, force: true })
      git(testRepoPath, ['worktree', 'prune'])
    }
    for (const args of [
      ['branch', '-D', branchName],
      ['branch', '-D', sideBranch],
      ['tag', '-d', tagName]
    ]) {
      try {
        git(testRepoPath, args)
      } catch {}
    }
  })
  seedDeepHistory(worktreePath, branchName, sideBranch, tagName)
  const headId = git(worktreePath, ['rev-parse', 'HEAD']).trim()
  const tagOnlyId = git(worktreePath, ['rev-parse', `${tagName}^{commit}`]).trim()
  const sideBaseId = git(worktreePath, [
    'rev-parse',
    `${branchName}~${DEEP_COMMITS - SIDE_BASE}`
  ]).trim()

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
    await orcaPage.getByRole('button', { name: /Commits/ }).click()
  }
  await expect(historyRows.first()).toBeVisible({ timeout: 15_000 })
  await orcaPage.getByRole('combobox', { name: 'Branch filter' }).first().click()
  await orcaPage.locator('[cmdk-item]').filter({ hasText: 'All branches' }).first().click()
  await orcaPage.keyboard.press('Escape')

  await orcaPage.keyboard.press('ControlOrMeta+Shift+H')
  const graph = orcaPage.locator('[data-git-graph-root]')
  await expect(graph).toBeVisible({ timeout: 15_000 })
  const rows = graph.getByTestId('git-graph-full-row')
  const list = graph.locator('[data-git-graph-list]')
  // Why by id: an arrow's tooltip names the commit it points at, so text also matches other rows.
  const row = (id: string) =>
    graph.locator(`[data-testid="git-graph-full-row"][data-commit-id="${id}"]`)
  await expect(row(headId)).toBeVisible({ timeout: 15_000 })
  const firstPage = await rows.count()
  expect(firstPage).toBeLessThanOrEqual(51)

  // Scrolling to the end loads the next page with no button press.
  await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await expect.poll(() => rows.count(), { timeout: 20_000 }).toBeGreaterThan(firstPage + 50)
  await expect(row(sideBaseId)).toHaveCount(0)

  // The side branch's arrow points past the loaded rows; a click loads down to it and selects it.
  await list.evaluate((el) => el.scrollTo({ top: 0 }))
  const arrow = graph.locator(`[data-git-graph-jump="${sideBaseId}"]`)
  await expect(arrow.first()).toBeAttached({ timeout: 10_000 })
  expect(await arrow.first().locator('title').textContent()).toContain(
    'Continues past the loaded commits'
  )
  await arrow.first().click()
  await expect(row(sideBaseId)).toHaveAttribute('data-selected', 'true', {
    timeout: 30_000
  })
  await expect(row(sideBaseId)).toBeInViewport()

  // At the 1000-commit cap the footer says so instead of loading on.
  const cap = graph.locator('[data-git-graph-auto-load="cap"]')
  await expect
    .poll(
      async () => {
        await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
        return cap.isVisible()
      },
      { timeout: 60_000 }
    )
    .toBe(true)
  await expect(cap).toContainText('Showing the first 1000 commits')
  await expect(rows).toHaveCount(1000)

  // Tags stay out of the walk until the Tags source is ticked.
  await list.evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(row(tagOnlyId)).toHaveCount(0)
  await graph.getByRole('combobox', { name: 'Branch filter' }).click()
  const tagsSource = orcaPage.locator('[cmdk-item][data-value="source-tags"]')
  await expect(tagsSource).toBeVisible({ timeout: 10_000 })
  await tagsSource.click()
  await orcaPage.keyboard.press('Escape')
  await expect(row(tagOnlyId)).toBeVisible({ timeout: 15_000 })
  await expect(row(tagOnlyId)).toContainText(tagName)
})
