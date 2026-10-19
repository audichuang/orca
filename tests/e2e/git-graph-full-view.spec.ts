import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { openSourceControlForWorktree } from './helpers/worktree-registration'
import { clipboardText, setClipboard } from './helpers/folder-multi-repo-scenario-context'

const SHOTS_DIR = process.env.ORCA_E2E_SHOTS_DIR ?? path.join(os.tmpdir(), 'orca-git-graph-shots')

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

const AUTHORS = ['Ada Lovelace', 'Linus Torvalds', 'Grace Hopper', 'Ken Thompson']
let authorTurn = 0

function commitFile(cwd: string, file: string, content: string, message: string): void {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
  writeFileSync(path.join(cwd, file), content)
  git(cwd, ['add', file])
  // Distinct authors so the avatars and author column show real variety.
  const author = AUTHORS[authorTurn++ % AUTHORS.length]!
  const email = `${author.split(' ')[0]!.toLowerCase()}@example.com`
  // Why --author: the e2e env pins GIT_AUTHOR_NAME, which beats `-c user.name`.
  git(cwd, ['commit', `--author=${author} <${email}>`, '-m', message])
}

test('opens the Git Graph tab, switches repo and opens a commit file diff', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  // Why longer than the default: the review screenshot matrix walks five window sizes and both themes.
  test.setTimeout(300_000)
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const branchName = `e2e-graph-${suffix}`
  const worktreePath = path.join(os.tmpdir(), branchName)
  const extraBranches = [`feature/graph-a-${suffix}`, `feature/graph-b-${suffix}`]
  const tags = [`v1.0.0-${suffix}`, `v1.1.0-${suffix}`]
  git(testRepoPath, ['worktree', 'add', worktreePath, '-b', branchName])
  registerPostElectronShutdownCleanup(async () => {
    try {
      git(testRepoPath, ['worktree', 'remove', '--force', worktreePath])
    } catch {
      rmSync(worktreePath, { recursive: true, force: true })
      git(testRepoPath, ['worktree', 'prune'])
    }
    for (const branch of [branchName, ...extraBranches]) {
      try {
        git(testRepoPath, ['branch', '-D', branch])
      } catch {}
    }
    for (const tag of tags) {
      try {
        git(testRepoPath, ['tag', '-d', tag])
      } catch {}
    }
  })

  // Seed a multi-lane history: two feature branches, a merge, and tags.
  commitFile(worktreePath, 'src/graph/base.ts', 'export const base = 1\n', 'Add graph base module')
  git(worktreePath, ['tag', tags[0]])
  git(worktreePath, ['branch', extraBranches[0]])
  git(worktreePath, ['branch', extraBranches[1]])
  commitFile(worktreePath, 'src/graph/main-a.ts', 'export const a = 1\n', 'Main: add module A')
  git(worktreePath, ['checkout', extraBranches[0]])
  commitFile(worktreePath, 'src/feature/a1.ts', 'export const a1 = 1\n', 'Feature A: first step')
  commitFile(worktreePath, 'src/feature/a2.ts', 'export const a2 = 2\n', 'Feature A: second step')
  git(worktreePath, ['checkout', extraBranches[1]])
  commitFile(worktreePath, 'src/feature/b1.ts', 'export const b1 = 1\n', 'Feature B: experiment')
  git(worktreePath, ['checkout', branchName])
  commitFile(worktreePath, 'src/graph/main-b.ts', 'export const b = 2\n', 'Main: add module B')
  git(worktreePath, [
    'merge',
    '--no-ff',
    extraBranches[0],
    '-m',
    `Merge branch '${extraBranches[0]}' into ${branchName}`
  ])
  git(worktreePath, ['tag', tags[1]])
  commitFile(
    worktreePath,
    'src/graph/after-merge.ts',
    'export const afterMerge = true\n',
    'Post-merge cleanup with multiple files\n\nFollows the feature A merge.\n- drops the temporary shim\n- keeps module B exports stable'
  )
  // A remote-tracking branch, so the branch tree shows a remote group.
  const remoteRef = `refs/remotes/origin/graph-review-${suffix}`
  git(worktreePath, ['update-ref', remoteRef, `${extraBranches[1]}`])
  registerPostElectronShutdownCleanup(async () => {
    try {
      git(testRepoPath, ['update-ref', '-d', remoteRef])
    } catch {}
  })

  mkdirSync(SHOTS_DIR, { recursive: true })
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
  await expect(orcaPage.getByRole('combobox', { name: 'Branch filter' }).first()).toContainText(
    'All branches'
  )
  // The branch picker is multi-select and stays open after a pick.
  await orcaPage.keyboard.press('Escape')
  await expect(orcaPage.locator('[cmdk-item]').first()).toBeHidden()

  // Mod+Shift+H opens the graph as an editor tab, not a modal, so the sidebar button is optional.
  await orcaPage.keyboard.press('ControlOrMeta+Shift+H')
  const graph = orcaPage.locator('[data-git-graph-root]')
  await expect(graph).toBeVisible({ timeout: 15_000 })
  await expect(orcaPage.getByRole('dialog')).toHaveCount(0)
  const graphTab = orcaPage.locator('[data-tab-id]').filter({ hasText: 'Git Graph' })
  await expect(graphTab).toHaveCount(1)
  await expect(graphTab).toContainText('Git Graph')
  const rows = graph.getByTestId('git-graph-full-row')
  await expect(rows.filter({ hasText: 'Feature B: experiment' })).toBeVisible({ timeout: 15_000 })
  await expect(rows.filter({ hasText: 'Merge branch' })).toBeVisible()
  // Keyboard focus lands on the commit list, not the first toolbar button.
  await expect(rows.first()).toBeFocused()
  await orcaPage.waitForTimeout(1000)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '01-git-graph-tab.png') })

  await rows.filter({ hasText: 'Post-merge cleanup' }).click()
  const files = graph.getByTestId('git-history-commit-file')
  await expect(files.first()).toBeVisible({ timeout: 15_000 })
  await expect(files.filter({ hasText: 'after-merge.ts' })).toBeVisible()
  await expect(rows.filter({ hasText: 'Post-merge cleanup' })).toHaveAttribute(
    'data-selected',
    'true'
  )
  await orcaPage.waitForTimeout(300)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '02-git-graph-commit-selected.png') })

  // Cmd/Ctrl-click a second commit: the files of both merge, and one click copies them all.
  await rows.filter({ hasText: 'Feature A: second step' }).click()
  await rows.filter({ hasText: 'Feature A: first step' }).click({ modifiers: ['ControlOrMeta'] })
  await expect(graph.getByText('Changed files (2) · 2 commits')).toBeVisible()
  await expect(files.filter({ hasText: 'a1.ts' })).toBeVisible()
  await expect(files.filter({ hasText: 'a2.ts' })).toBeVisible()
  await orcaPage.mouse.move(5, 500)
  await orcaPage.waitForTimeout(300)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '02a-git-graph-multi-selected.png') })
  await setClipboard(orcaPage, 'sentinel')
  await graph.getByRole('button', { name: 'Copy Full Source of all changed files' }).click()
  await expect.poll(() => clipboardText(orcaPage), { timeout: 20_000 }).toContain('a1 = 1')
  const copied = await clipboardText(orcaPage)
  expect(copied).toContain('a2 = 2')
  expect(copied).not.toContain('afterMerge')

  // Drag the details divider both ways; the details column follows.
  const divider = graph.getByRole('separator', { name: 'Resize commit details' })
  const details = divider.locator('..')
  const drag = async (dx: number): Promise<void> => {
    const handle = (await divider.boundingBox())!
    await orcaPage.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await orcaPage.mouse.down()
    await orcaPage.mouse.move(handle.x + handle.width / 2 + dx, handle.y + handle.height / 2, {
      steps: 5
    })
    await orcaPage.mouse.up()
  }
  const widthBefore = (await details.boundingBox())!.width
  await drag(120)
  await expect.poll(async () => (await details.boundingBox())!.width).toBeLessThan(widthBefore - 60)
  const narrowed = (await details.boundingBox())!.width
  await drag(-120)
  await expect.poll(async () => (await details.boundingBox())!.width).toBeGreaterThan(narrowed + 60)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '02b-git-graph-details-resized.png') })

  // Shrinking the window re-clamps the details so the commit list keeps its room.
  await orcaPage.setViewportSize({ width: 1280, height: 1000 })
  await expect.poll(async () => (await rows.first().boundingBox())!.width).toBeGreaterThan(300)
  await orcaPage.setViewportSize({ width: 1600, height: 1000 })

  // Also capture the merge commit's detail (multi-parent).
  await rows.filter({ hasText: 'Merge branch' }).click()
  await expect(files.first()).toBeVisible({ timeout: 15_000 })
  await orcaPage.waitForTimeout(300)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '03-git-graph-merge-selected.png') })

  // The branch tree jumps to a loaded tip and the details name the containing branches.
  // Why toggle: a tab beside both sidebars is narrower than the auto-open width, unlike the old dialog.
  const branchTree = graph.getByRole('navigation', { name: 'Branches and tags' })
  if (!(await branchTree.isVisible())) {
    await graph.getByRole('button', { name: 'Toggle branches' }).click()
  }
  await graph.locator(`[data-branch-ref="refs/heads/${extraBranches[1]}"]`).click()
  await expect(rows.filter({ hasText: 'Feature B: experiment' })).toHaveAttribute(
    'data-selected',
    'true'
  )
  await expect(graph.getByText('In branches')).toBeVisible()

  // Screenshot matrix for review: window sizes x single / multi selection, then dark theme.
  // Why: the hidden test window never advances CSS transitions, so a deselected row would keep its tint.
  await orcaPage.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' })
  const shoot = async (name: string): Promise<void> => {
    await orcaPage.mouse.move(2, 2)
    await orcaPage.waitForTimeout(400)
    await orcaPage.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) })
  }
  const sizes = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 700 }
  ]
  for (const size of sizes) {
    await orcaPage.setViewportSize(size)
    await rows.filter({ hasText: 'Post-merge cleanup' }).click()
    await expect(files.filter({ hasText: 'after-merge.ts' })).toBeVisible()
    await shoot(`size-${size.width}x${size.height}-single`)
    await rows.filter({ hasText: 'Feature A: second step' }).click()
    await rows.filter({ hasText: 'Main: add module B' }).click({ modifiers: ['ControlOrMeta'] })
    await expect(graph.getByText('Changed files (2) · 2 commits')).toBeVisible()
    await shoot(`size-${size.width}x${size.height}-multi`)
  }
  // Too narrow to dock: the tree starts closed but still opens, as an overlay that closes on a jump.
  const tree = graph.getByRole('navigation', { name: 'Branches and tags' })
  await expect(tree).toBeHidden()
  await graph.getByRole('button', { name: 'Toggle branches' }).click()
  await expect(tree).toBeVisible()
  await shoot('size-1024x700-tree-overlay')
  await graph.locator(`[data-branch-ref="refs/heads/${extraBranches[1]}"]`).click()
  await expect(tree).toBeHidden()
  await expect(rows.filter({ hasText: 'Feature B: experiment' })).toHaveAttribute(
    'data-selected',
    'true'
  )

  // The smallest window still shows readable subjects and never scrolls sideways.
  // Why hide both sidebars: at 600px they alone fill the window, leaving the tab no width.
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    state.setSidebarOpen(false)
    state.setRightSidebarOpen(false)
  })
  await orcaPage.setViewportSize({ width: 600, height: 600 })
  await rows.filter({ hasText: 'Post-merge cleanup' }).click()
  const subject = rows.filter({ hasText: 'Post-merge cleanup' }).getByText('Post-merge cleanup', {
    exact: false
  })
  await expect(subject).toBeVisible()
  expect((await subject.boundingBox())!.width).toBeGreaterThan(100)
  const list = graph.locator('[data-git-graph-list]')
  expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await shoot('size-600x600-single')
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    state.setSidebarOpen(true)
    state.setRightSidebarOpen(true)
  })
  await orcaPage.setViewportSize({ width: 1600, height: 1000 })
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ theme: 'dark' }))
  await rows.filter({ hasText: 'Post-merge cleanup' }).click()
  await shoot('dark-single')
  await orcaPage.evaluate(() => window.__store!.getState().updateSettings({ theme: 'light' }))

  // Escape closes the branch tree overlay without leaving the tab.
  await orcaPage.setViewportSize({ width: 1024, height: 700 })
  await graph.getByRole('button', { name: 'Toggle branches' }).click()
  await expect(tree).toBeVisible()
  await orcaPage.keyboard.press('Escape')
  await expect(tree).toBeHidden()
  await expect(graph).toBeVisible()
  await orcaPage.setViewportSize({ width: 1600, height: 1000 })

  await rows.filter({ hasText: 'Post-merge cleanup' }).click()
  await files.filter({ hasText: 'after-merge.ts' }).click()
  await expect(orcaPage.locator('.monaco-diff-editor')).toBeVisible({ timeout: 20_000 })
  await expect(
    orcaPage.locator('.modified-in-monaco-diff-editor .view-line').filter({
      hasText: 'afterMerge'
    })
  ).toBeVisible()
  // The graph stays open as a tab beside the diff.
  await expect(graphTab).toHaveCount(1)
  await orcaPage.waitForTimeout(500)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '04-diff-opened.png') })

  // The sidebar button focuses the same tab rather than opening a second one.
  const openButton = orcaPage.getByRole('button', { name: 'Open Git Graph' })
  if (!(await openButton.isVisible())) {
    await orcaPage.getByRole('button', { name: /Commits/ }).click()
  }
  await openButton.click()
  await expect(graph).toBeVisible()
  await expect(graphTab).toHaveCount(1)
  await expect(rows.filter({ hasText: 'Post-merge cleanup' })).toHaveAttribute(
    'data-selected',
    'true'
  )

  // Switch to the main checkout: its HEAD has none of this worktree's commits.
  const switcher = graph.getByRole('combobox', { name: 'Repository' })
  await expect(switcher).toContainText(branchName)
  await switcher.click()
  const mainChoice = orcaPage.locator('[cmdk-item]').filter({ hasNotText: branchName }).first()
  await expect(mainChoice).toBeVisible()
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '05-repo-switcher-open.png') })
  await mainChoice.click()
  await expect(switcher).not.toContainText(branchName)
  await expect(rows.first()).toBeVisible({ timeout: 15_000 })
  await expect(rows.filter({ hasText: 'Post-merge cleanup' })).toHaveCount(0)
  await orcaPage.waitForTimeout(300)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '06-switched-repo.png') })

  // And back.
  await switcher.click()
  await orcaPage.locator('[cmdk-item]').filter({ hasText: branchName }).first().click()
  await expect(rows.filter({ hasText: 'Post-merge cleanup' })).toBeVisible({ timeout: 15_000 })
})
