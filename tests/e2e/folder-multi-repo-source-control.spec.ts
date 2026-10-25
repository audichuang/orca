import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { expectCopyToastLeavesClickable } from './helpers/settled-toast-box'
import { startHiddenRendererFrameCapture } from './helpers/hidden-renderer-frame-capture'
import { waitForSessionReady } from './helpers/store'
import {
  clipboardText,
  setClipboard,
  type ScenarioResult as Result
} from './helpers/folder-multi-repo-scenario-context'
import { runLayoutScenarios } from './helpers/folder-multi-repo-layout-scenarios'
import { runRestoreScenarios } from './helpers/folder-multi-repo-restore-scenarios'
import { runExternalChangeScenarios } from './helpers/folder-multi-repo-external-change-scenarios'
import { importMultiProductFolder } from './helpers/folder-multi-repo-import'
import { runAgentAndBannerScenarios } from './helpers/folder-multi-repo-agent-and-banner-scenarios'
import {
  changedLines,
  expectedPayload,
  git,
  readStatus,
  splitBlocks,
  statsLine,
  type ExpectedFile
} from './helpers/folder-multi-repo-expectations'

// Real-app check of the folder-workspace multi-repo Source Control, tab-owner/git-owner split and Snipcode copy/restore.
// ORCA_MR_FIXTURE_ROOT / ORCA_MR_ARTIFACTS override where the fixture and screenshots/payloads go.
test.use({ seedTestRepo: false })

const FIXTURE_SCRIPT = path.join(__dirname, 'helpers', 'folder-multi-repo-fixture.sh')

test('folder workspace multi-repo source control, copy and restore', async ({
  orcaPage: page
}, testInfo) => {
  test.setTimeout(10 * 60_000)
  const fixtureRoot = realpathSync(
    process.env.ORCA_MR_FIXTURE_ROOT
      ? (mkdirSync(process.env.ORCA_MR_FIXTURE_ROOT, { recursive: true }),
        process.env.ORCA_MR_FIXTURE_ROOT)
      : mkdtempSync(path.join(os.tmpdir(), 'orca-multi-repo-'))
  )
  const artifacts = process.env.ORCA_MR_ARTIFACTS ?? testInfo.outputDir
  const shots = process.env.ORCA_MR_SHOTS ?? path.join(artifacts, 'shots')
  mkdirSync(shots, { recursive: true })
  const P = execFileSync('bash', [FIXTURE_SCRIPT, path.join(fixtureRoot, 'fixture')], {
    encoding: 'utf8'
  }).trim()
  const R = {
    webapp: path.join(P, 'WebApp'),
    feature: path.join(P, 'WebApp-feature'),
    api: path.join(P, 'api-server'),
    core: path.join(P, 'libs', 'shared', 'core'),
    docs: path.join(P, 'docs-site')
  }
  const results: Result[] = []
  const shot = async (name: string) => {
    const p = path.join(shots, `${name}.png`)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))))
    await page.screenshot({ path: p })
    return p
  }
  const only = process.env.ORCA_MR_ONLY ? new RegExp(process.env.ORCA_MR_ONLY) : null
  const scenario = async (name: string, fn: (ev: string[]) => Promise<void>) => {
    if (only && !only.test(name)) {
      results.push({ name, status: 'blocked', evidence: ['filtered out by ORCA_MR_ONLY'] })
      return
    }
    const ev: string[] = []
    try {
      await fn(ev)
      results.push({ name, status: 'pass', evidence: ev })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        await shot(`FAIL-${name.split(' ')[0]}`)
      } catch {
        // best effort
      }
      results.push({ name, status: 'fail', evidence: ev, error: message.slice(0, 3000) })
    }
  }

  await waitForSessionReady(page)
  // Why: a hidden window stops painting; keep frames flowing so screenshots show the current UI.
  const stopFrameCapture = await startHiddenRendererFrameCapture(page)

  // ---- setup: import repos, create folder workspace, open Source Control ----
  const ids = await importMultiProductFolder(page, P)
  const folderKey = ids.folderKey
  const folderRow = page.locator(
    `[data-worktree-sidebar] [role="option"][data-worktree-id=${JSON.stringify(folderKey)}]`
  )
  await folderRow.click()
  await expect
    .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
    .toBe(folderKey)
  await page.evaluate(() => {
    const s = window.__store!.getState()
    s.setRightSidebarOpen(true)
    s.setRightSidebarTab('source-control')
  })
  // Why: single-click tabs are previews that the next click replaces; keep every opened tab so distinct-tab checks are meaningful.
  await page.evaluate(() =>
    window.__store!.getState().updateSettings({ editorPreviewTabsEnabled: false })
  )
  const refreshBtn = page.getByRole('button', { name: 'Refresh all repositories' })
  await refreshBtn.click()

  // Master-detail: one selectable row button per repo; the selected repo's panel fills the detail area.
  const repoHeaders = () => page.locator('[data-repo-row]')
  const header = (re: RegExp) => page.locator('[data-repo-row]').filter({ hasText: re })
  const countOf = async (re: RegExp) => {
    // Hidden at 0; "(?:^|\s)" keeps a sync count such as "↑2" from reading as the change count.
    const text = (await header(re).first().innerText()).replace(/\s+/g, ' ').trim()
    const m = text.match(/(?:^|\s)(\d+)$/)
    return m ? Number(m[1]) : 0
  }
  const entry = (area: string, p: string) =>
    page.locator(
      `[data-testid="source-control-entry"][data-source-control-area="${area}"][data-source-control-path=${JSON.stringify(p)}]`
    )
  const H = {
    api: /^api-server main\b/,
    core: /^core main\b/,
    docs: /^docs-site main\b/,
    web: /^WebApp main\b/,
    feature: /^WebApp-feature feature\/x\b/
  }
  // Selects the repo row; entry() rows are not repo-scoped, so exactly one repo may be selected.
  const expandOnly = async (re: RegExp) => {
    const h = header(re).first()
    if ((await h.getAttribute('aria-current')) !== 'true') {
      await h.click()
    }
    await expect(h).toHaveAttribute('aria-current', 'true')
    await expect(page.locator('[data-repo-row][aria-current="true"]')).toHaveCount(1)
  }
  const getOpenFiles = () =>
    page.evaluate(() =>
      window.__store!.getState().openFiles.map((f) => ({
        id: f.id,
        filePath: f.filePath,
        relativePath: f.relativePath,
        worktreeId: f.worktreeId,
        gitWorktreeId: f.gitWorktreeId ?? null,
        mode: f.mode,
        diffSource: f.diffSource ?? null
      }))
    )
  const wtIdByPath = (p: string) =>
    page.evaluate((target) => {
      const s = window.__store!.getState()
      for (const list of Object.values(s.worktreesByRepo)) {
        const w = list.find((x) => x.path === target)
        if (w) {
          return w.id
        }
      }
      return null
    }, p)
  const activeWt = () => page.evaluate(() => window.__store!.getState().activeWorktreeId)
  const diffText = async (side: 'original' | 'modified') =>
    (await page.locator(`.${side}-in-monaco-diff-editor .view-lines`).first().innerText()).replace(
      /\u00a0/g,
      ' '
    )
  const waitSettled = async () => {
    // refresh is async; poll until the header counts stop changing
    let prev = ''
    await expect
      .poll(
        async () => {
          const cur = (await repoHeaders().allInnerTexts()).join('|')
          const same = cur === prev
          prev = cur
          return same
        },
        { timeout: 15_000, intervals: [400] }
      )
      .toBe(true)
  }

  const hiddenHint = page.getByText(/Hidden worktrees under this folder are not included \(1\)/)
  await scenario('S0 Hidden linked worktree is flagged, not silently dropped', async (ev) => {
    await expect(hiddenHint).toBeVisible({ timeout: 30_000 })
    await expect(header(H.web).first()).toBeVisible({ timeout: 30_000 })
    await expect(header(H.feature)).toHaveCount(0)
    await setClipboard(page, 'sentinel')
    await page.getByRole('button', { name: 'Copy all changes' }).first().click()
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /Hidden worktrees .* \(1\)/ })
    ).toBeVisible({ timeout: 10_000 })
    await expect.poll(() => clipboardText(page), { timeout: 20_000 }).not.toBe('sentinel')
    const payload = await clipboardText(page)
    expect(payload).not.toContain('WebApp-feature/')
    ev.push(
      'default hidden: hint + copy toast shown, feature worktree absent from list and payload'
    )
    await shot('S0-hidden-worktree-hint')
  })
  // Why: the remaining scenarios need the linked worktree listed, so make it visible now.
  await page.evaluate(async () => {
    const s = window.__store!
    for (const repo of s.getState().repos) {
      await s.getState().updateRepo(repo.id, { externalWorktreeVisibility: 'show' })
      await s.getState().fetchWorktrees(repo.id)
    }
  })
  await expect(hiddenHint).toHaveCount(0, { timeout: 30_000 })
  await refreshBtn.click()

  await scenario('S1 Repo list', async (ev) => {
    // docs-site is clean, so it sits in the folded "No changes" group; the panel remembers it unfolded.
    const noChanges = page.getByRole('button', { name: /^No changes/, expanded: false })
    await noChanges.click({ timeout: 30_000 })
    await expect
      .poll(async () => (await repoHeaders().count()) >= 5, { timeout: 30_000 })
      .toBe(true)
    const labels = (await repoHeaders().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    ev.push(`headers: ${JSON.stringify(labels)}`)
    ev.push(`scanned: ${JSON.stringify(ids.scanned.map((x) => path.relative(P, x)))}`)
    expect(labels.length).toBe(5)
    for (const re of [H.web, H.feature, H.api, H.core, H.docs]) {
      expect(labels.some((l) => re.test(l))).toBe(true)
    }
    expect(labels.join('|').toLowerCase()).not.toContain('notes')
    const expectCount = async (re: RegExp, repo: string) =>
      expect.poll(() => countOf(re), { timeout: 20_000 }).toBe(readStatus(repo).length)
    await expectCount(H.web, R.webapp)
    await expectCount(H.feature, R.feature)
    await expectCount(H.api, R.api)
    await expectCount(H.core, R.core)
    await expectCount(H.docs, R.docs)
    ev.push(
      `counts web=${readStatus(R.webapp).length} feature=${readStatus(R.feature).length} api=${readStatus(R.api).length} core=${readStatus(R.core).length} docs=${readStatus(R.docs).length}`
    )
    const apiHeaderText = (await header(H.api).first().locator('xpath=..').innerText()).replace(
      /\s+/g,
      ' '
    )
    ev.push(`api header row: ${apiHeaderText}`)
    expect(apiHeaderText).toContain('↓1')
    expect(apiHeaderText).toContain('↑2')
    await shot('S1-repo-list')
  })

  await scenario('S2 Default selection and remembered pick', async (ev) => {
    // rows sort by display name: api-server is the first dirty repo
    await expect(header(H.api).first()).toHaveAttribute('aria-current', 'true')
    for (const k of ['core', 'docs', 'web', 'feature'] as const) {
      await expect(header(H[k]).first()).not.toHaveAttribute('aria-current', 'true')
    }
    // entry() is not repo-scoped: pick a path only the api repo has.
    const apiOnly = { area: 'unstaged', path: 'server.ts' }
    expect(readStatus(R.api)).toContainEqual(expect.objectContaining({ ...apiOnly }))
    await expect(
      entry(apiOnly.area, apiOnly.path),
      'detail panel shows the default repo'
    ).toHaveCount(1, { timeout: 15_000 })
    ev.push('default: api-server selected and its panel shown, others unselected')
    await shot('S2a-default-selected')
    await header(H.web).first().click()
    await expect(header(H.web).first()).toHaveAttribute('aria-current', 'true')
    await expect(header(H.api).first()).not.toHaveAttribute('aria-current', 'true')
    await expect(entry(apiOnly.area, apiOnly.path)).toHaveCount(0)
    await refreshBtn.click()
    await waitSettled()
    await page.waitForTimeout(1500)
    await expect(header(H.web).first()).toHaveAttribute('aria-current', 'true')
    await expect(header(H.api).first()).not.toHaveAttribute('aria-current', 'true')
    ev.push('after clicking WebApp and a refresh: WebApp still selected, api-server not')
    await shot('S2b-selection-after-refresh')
  })

  const LETTER: Record<string, string> = { M: 'M', D: 'D', R: 'R', A: 'A', '?': 'U' }
  await scenario('S3 WebApp tree', async (ev) => {
    await expandOnly(H.web)
    const status = readStatus(R.webapp)
    for (const e of status) {
      const row = entry(e.area, e.path)
      await expect(row, `${e.area} ${e.path}`).toHaveCount(1, { timeout: 15_000 })
      await row.scrollIntoViewIfNeeded()
      const text = (await row.innerText()).replace(/\s+/g, ' ').trim()
      ev.push(`${e.area} ${e.path} -> "${text}" (git ${e.code})`)
      expect(text, text).toMatch(new RegExp(`(^|\\s)${LETTER[e.code]}$`))
    }
    const stagedDom = await page
      .locator('[data-testid="source-control-entry"][data-source-control-area="staged"]')
      .count()
    expect(stagedDom).toBe(status.filter((e) => e.area === 'staged').length)
    await shot('S3-webapp-tree')
  })

  await scenario('S4 Diff tabs in the folder workspace', async (ev) => {
    await expandOnly(H.web)
    const rel = 'src/unstaged-mod.ts'
    await entry('unstaged', rel).click()
    await expect(page.locator('.monaco-diff-editor').first()).toBeVisible({ timeout: 20_000 })
    const webWt = await wtIdByPath(R.webapp)
    const files = await getOpenFiles()
    const tab = files.find((f) => f.relativePath === rel && f.diffSource === 'unstaged')
    ev.push(`tab: ${JSON.stringify(tab)}`)
    expect(tab).toBeTruthy()
    expect(tab!.worktreeId).toBe(folderKey)
    expect(tab!.filePath).toBe(path.join(R.webapp, rel))
    expect(tab!.gitWorktreeId).toBe(webWt)
    expect(await activeWt()).toBe(folderKey)
    const cl = changedLines(R.webapp, false, rel)
    await expect.poll(() => diffText('modified'), { timeout: 15_000 }).toContain(cl.added[0])
    for (const l of cl.added) {
      expect(await diffText('modified')).toContain(l)
    }
    ev.push(`git diff added=${JSON.stringify(cl.added)} removed=${JSON.stringify(cl.removed)}`)
    await shot('S4a-unstaged-diff')
    // partially staged file: staged side shows the index version only
    const partial = 'src/partial.ts'
    await entry('staged', partial).click()
    await expect
      .poll(async () =>
        (await getOpenFiles()).some((f) => f.relativePath === partial && f.diffSource === 'staged')
      )
      .toBe(true)
    const staged = changedLines(R.webapp, true, partial)
    await expect.poll(() => diffText('modified'), { timeout: 15_000 }).toContain(staged.added[0])
    const modText = await diffText('modified')
    expect(modText).toContain('index-edit')
    expect(modText).not.toContain('worktree-edit')
    ev.push(
      `staged side contains index-edit and not worktree-edit; git --cached added=${JSON.stringify(staged.added)}`
    )
    await shot('S4b-staged-partial-diff')
    await entry('unstaged', partial).click()
    await expect
      .poll(async () =>
        (await getOpenFiles()).some(
          (f) => f.relativePath === partial && f.diffSource === 'unstaged'
        )
      )
      .toBe(true)
    await expect.poll(() => diffText('modified'), { timeout: 15_000 }).toContain('worktree-edit')
    // README.md from two repos -> two distinct tabs
    await entry('unstaged', 'README.md').click()
    await expect
      .poll(() => diffText('modified'), { timeout: 15_000 })
      .toContain('webapp readme change')
    await shot('S4c-readme-webapp')
    await expandOnly(H.api)
    await entry('unstaged', 'README.md').click()
    await expect
      .poll(() => diffText('modified'), { timeout: 15_000 })
      .toContain('api readme change')
    await shot('S4d-readme-api')
    const readmes = (await getOpenFiles()).filter((f) => f.relativePath === 'README.md')
    ev.push(`README tabs: ${JSON.stringify(readmes)}`)
    expect(readmes.length).toBe(2)
    expect(new Set(readmes.map((f) => f.id)).size).toBe(2)
    expect(new Set(readmes.map((f) => f.filePath)).size).toBe(2)
    expect(readmes.every((f) => f.worktreeId === folderKey)).toBe(true)
    expect(await activeWt()).toBe(folderKey)
  })

  await scenario('S5 Stage and unstage', async (ev) => {
    await expandOnly(H.web)
    const rel = 'src/unstaged-mod.ts'
    const staged = () =>
      git(R.webapp, 'diff', '--cached', '--name-only').split('\n').filter(Boolean)
    const before = staged()
    expect(before).not.toContain(rel)
    const row = entry('unstaged', rel)
    await row.hover()
    await row.getByRole('button', { name: 'Stage', exact: true }).click()
    await expect.poll(staged, { timeout: 15_000 }).toContain(rel)
    await expect(entry('staged', rel)).toHaveCount(1, { timeout: 15_000 })
    await expect(entry('unstaged', rel)).toHaveCount(0, { timeout: 15_000 })
    ev.push(`staged after Stage: ${JSON.stringify(staged())}`)
    await shot('S5a-staged')
    const srow = entry('staged', rel)
    await srow.hover()
    await srow.getByRole('button', { name: 'Unstage', exact: true }).click()
    await expect.poll(staged, { timeout: 15_000 }).not.toContain(rel)
    await expect(entry('unstaged', rel)).toHaveCount(1, { timeout: 15_000 })
    ev.push(`staged after Unstage: ${JSON.stringify(staged())}`)
    expect(staged()).toEqual(before)
  })

  await scenario('S6 Commit in one repo', async (ev) => {
    const others = { web: R.webapp, feature: R.feature, api: R.api, docs: R.docs }
    const snap = () =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(others).map(([k, v]) => [
            k,
            [git(v, 'status', '--porcelain'), git(v, 'rev-parse', 'HEAD')]
          ])
        )
      )
    const before = snap()
    const headBefore = git(R.core, 'rev-parse', 'HEAD').trim()
    await expandOnly(H.core)
    const row = entry('unstaged', 'core.ts')
    await expect(row).toHaveCount(1, { timeout: 15_000 })
    await row.hover()
    await row.getByRole('button', { name: 'Stage', exact: true }).click()
    await expect(entry('staged', 'core.ts')).toHaveCount(1, { timeout: 15_000 })
    await shot('S6a-core-staged')
    await page.getByRole('textbox', { name: 'Commit message' }).fill('test: commit core only')
    await page.getByRole('button', { name: 'Commit', exact: true }).click()
    await expect
      .poll(() => git(R.core, 'log', '-1', '--format=%s'), { timeout: 20_000 })
      .toBe('test: commit core only\n')
    expect(git(R.core, 'rev-parse', 'HEAD').trim()).not.toBe(headBefore)
    expect(git(R.core, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe('core.ts')
    expect(git(R.core, 'status', '--porcelain').trim()).toBe('?? untracked.txt')
    expect(snap()).toBe(before)
    ev.push(
      `core log: ${git(R.core, 'log', '-1', '--format=%h %an %s').trim()}; other repos unchanged`
    )
    await expect(entry('staged', 'core.ts')).toHaveCount(0, { timeout: 15_000 })
    await shot('S6b-core-committed')
  })

  await scenario('S7 Linked worktree', async (ev) => {
    await expandOnly(H.feature)
    const rel = 'src/unstaged-mod.ts'
    const row = entry('unstaged', rel)
    await expect(row).toHaveCount(1, { timeout: 15_000 })
    await row.click()
    await expect(page.locator('.monaco-diff-editor').first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => diffText('modified'), { timeout: 15_000 }).toContain('feature change')
    const featWt = await wtIdByPath(R.feature)
    const tab = (await getOpenFiles()).find(
      (f) => f.relativePath === rel && f.filePath === path.join(R.feature, rel)
    )
    ev.push(`tab: ${JSON.stringify(tab)} featWt=${featWt}`)
    expect(tab).toBeTruthy()
    expect(tab!.gitWorktreeId).toBe(featWt)
    expect(tab!.worktreeId).toBe(folderKey)
    await shot('S7-feature-diff')
  })

  await scenario('S8 External refresh', async (ev) => {
    await expandOnly(H.api)
    await expect.poll(() => countOf(H.api), { timeout: 20_000 }).toBe(readStatus(R.api).length)
    const base = await countOf(H.api)
    writeFileSync(path.join(R.api, 'outside-edit.txt'), 'made outside the app\n')
    const t0 = Date.now()
    await expect.poll(() => countOf(H.api), { timeout: 40_000, intervals: [500] }).toBe(base + 1)
    ev.push(`poll refresh picked up an outside file in ${Date.now() - t0}ms (no manual refresh)`)
    await expect(entry('untracked', 'outside-edit.txt')).toHaveCount(1, { timeout: 15_000 })
    writeFileSync(path.join(R.api, 'outside-edit-2.txt'), 'second\n')
    await refreshBtn.click()
    const t1 = Date.now()
    await expect.poll(() => countOf(H.api), { timeout: 15_000 }).toBe(base + 2)
    ev.push(`manual refresh picked up second file in ${Date.now() - t1}ms`)
    await shot('S8-external-refresh')
    ev.push('app-editor save path not automated (see notes)')
  })

  const copiedPayload = async () => {
    await expect.poll(() => clipboardText(page), { timeout: 20_000 }).not.toBe('sentinel')
    const actual = await clipboardText(page)
    const t = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: statsLine(actual) })
      .last()
    await expect(t).toBeVisible({ timeout: 10_000 })
    return { actual, toast: (await t.innerText()).replace(/\s+/g, ' ') }
  }
  const compare = (ev: string[], name: string, actual: string, expected: string) => {
    writeFileSync(path.join(artifacts, `payload-${name}.txt`), actual)
    writeFileSync(path.join(artifacts, `expected-${name}.txt`), expected)
    ev.push(
      `payload ${name}: ${actual.length} chars, ${splitBlocks(actual).length - 1} files, exact=${actual === expected}`
    )
    const a = splitBlocks(actual)
    const e = splitBlocks(expected)
    expect(
      a.map((b) => b.split('\n')[0] ?? ''),
      'header lines'
    ).toEqual(e.map((b) => b.split('\n')[0] ?? ''))
    expect(actual).toBe(expected)
  }

  const stagedSectionCopy = () =>
    page
      .locator('button[aria-expanded]')
      .filter({ hasText: /^Staged/i })
      .first()
      .locator('xpath=ancestor::div[contains(@class,"group/section")][1]')
      .getByRole('button', { name: 'Copy Full Source' })

  await scenario('S9a Copy Full Source: row context menu', async (ev) => {
    await expandOnly(H.web)
    const cases: { area: 'unstaged' | 'staged'; p: string }[] = [
      { area: 'unstaged', p: 'src/deleted-unstaged.ts' },
      { area: 'unstaged', p: 'src/partial.ts' },
      { area: 'staged', p: 'src/partial.ts' },
      { area: 'staged', p: 'src/new-name.ts' }
    ]
    for (const c of cases) {
      await setClipboard(page, 'sentinel')
      await entry(c.area, c.p).click({ button: 'right' })
      if (c.area === 'staged' && c.p === 'src/partial.ts') {
        await expect(page.getByRole('menuitem', { name: 'Copy Full Source' })).toBeVisible()
        await page.waitForTimeout(400) // menu open animation
        await shot('S9a-context-menu')
      }
      await page.getByRole('menuitem', { name: 'Copy Full Source' }).click()
      const { actual, toast } = await copiedPayload()
      const e = readStatus(R.webapp).find((x) => x.area === c.area && x.path === c.p)!
      const expected = expectedPayload({
        rootName: 'MultiProduct',
        files: [{ repoDir: 'WebApp', repoAbs: R.webapp, entry: e }],
        forceIndexForStaged: true
      })
      compare(ev, `S9a-${c.area}-${c.p.replace(/\//g, '_')}`, actual, expected)
      expect(toast).toContain(statsLine(actual))
      ev.push(`toast: ${toast}`)
      await expect(page.getByRole('menuitem', { name: 'Copy Full Source' })).toHaveCount(0)
      const later = cases.slice(cases.indexOf(c) + 1).map((n) => entry(n.area, n.p))
      await expectCopyToastLeavesClickable(page, [...later, stagedSectionCopy()])
    }
  })

  await scenario('S9b Copy Full Source: Staged section header', async (ev) => {
    await expandOnly(H.web)
    await setClipboard(page, 'sentinel')
    await stagedSectionCopy().click()
    const { actual, toast } = await copiedPayload()
    const files = readStatus(R.webapp)
      .filter((e) => e.area === 'staged')
      .map((e) => ({ repoDir: 'WebApp', repoAbs: R.webapp, entry: e }))
    const expected = expectedPayload({ rootName: 'MultiProduct', files, forceIndexForStaged: true })
    compare(ev, 'S9b-staged-section', actual, expected)
    expect(actual).toContain('index-edit')
    expect(actual).not.toContain('worktree-edit')
    ev.push(`toast: ${toast}`)
    expect(toast).toContain(statsLine(actual))
  })

  await scenario('S9c Copy all changes (folder header)', async (ev) => {
    await setClipboard(page, 'sentinel')
    await page.getByRole('button', { name: 'Copy all changes' }).first().click()
    const { actual, toast } = await copiedPayload()
    const order: [string, string, string][] = [
      ['api-server', R.api, 'api'],
      ['libs/shared/core', R.core, 'core'],
      ['docs-site', R.docs, 'docs'],
      ['WebApp', R.webapp, 'web'],
      ['WebApp-feature', R.feature, 'feature']
    ]
    const files: ExpectedFile[] = []
    for (const [dir, abs] of order) {
      const st = readStatus(abs)
      for (const area of ['unstaged', 'untracked', 'staged'] as const) {
        for (const e of st.filter((x) => x.area === area)) {
          files.push({ repoDir: dir, repoAbs: abs, entry: e })
        }
      }
    }
    const expected = expectedPayload({
      rootName: 'MultiProduct',
      files,
      forceIndexForStaged: false
    })
    compare(ev, 'S9c-all-changes', actual, expected)
    expect(actual).not.toContain('logo.png')
    ev.push(`toast: ${toast}`)
    expect(toast).toContain(statsLine(actual))
  })

  await scenario('S9d Copy: per-repo header and the Changes section', async (ev) => {
    const copyFrom = async (re: RegExp, repoRow = false) => {
      await setClipboard(page, 'sentinel')
      const container = repoRow
        ? header(re).first().locator('xpath=..')
        : // Why the detail scope: the repo list's own "Changes" group header also matches.
          page
            .locator('[data-folder-repo-detail] button[aria-expanded]')
            .filter({ hasText: re })
            .first()
            .locator('xpath=ancestor::div[contains(@class,"group/section")][1]')
      await container
        .getByRole('button', { name: /Copy (Full Source|all changes)/ })
        .first()
        .click()
      return copiedPayload()
    }
    // per-repo header: one member, worktree content (forceIndexForStaged=false)
    await expandOnly(H.api)
    const apiFiles = readStatus(R.api).map((e) => ({
      repoDir: 'api-server',
      repoAbs: R.api,
      entry: e
    }))
    const repoCopy = await copyFrom(H.api, true)
    compare(
      ev,
      'S9d-repo-header-api',
      repoCopy.actual,
      expectedPayload({ rootName: 'MultiProduct', files: apiFiles, forceIndexForStaged: false })
    )
    await expandOnly(H.web)
    // Why one section: upstream lists untracked files inside Changes, so its copy takes both areas.
    const { actual } = await copyFrom(/^Changes/i)
    const webStatus = readStatus(R.webapp)
    const files = (['unstaged', 'untracked'] as const).flatMap((area) =>
      webStatus
        .filter((e) => e.area === area)
        .map((e) => ({ repoDir: 'WebApp', repoAbs: R.webapp, entry: e }))
    )
    compare(
      ev,
      'S9d-section-Changes',
      actual,
      expectedPayload({ rootName: 'MultiProduct', files, forceIndexForStaged: true })
    )
  })

  await scenario('S9a-multi Copy Full Source on a multi-selection', async (ev) => {
    await expandOnly(H.web)
    const rows = [
      { area: 'unstaged', p: 'src/partial.ts' },
      { area: 'unstaged', p: 'src/deleted-unstaged.ts' }
    ]
    await setClipboard(page, 'sentinel')
    await entry(rows[0]!.area, rows[0]!.p).click({ modifiers: ['ControlOrMeta'] })
    await entry(rows[1]!.area, rows[1]!.p).click({ modifiers: ['ControlOrMeta'] })
    // A modifier click must select, not open a split.
    await expect(page.getByRole('button', { name: 'Copy Full Source' }).last()).toBeVisible()
    await shot('S9a-multi-selection')
    await page.getByRole('button', { name: 'Copy Full Source' }).last().click()
    const { actual, toast } = await copiedPayload()
    const st = readStatus(R.webapp)
    const files = rows.map((r) => ({
      repoDir: 'WebApp',
      repoAbs: R.webapp,
      entry: st.find((x) => x.area === r.area && x.path === r.p)!
    }))
    const fwd = expectedPayload({ rootName: 'MultiProduct', files, forceIndexForStaged: true })
    const rev = expectedPayload({
      rootName: 'MultiProduct',
      files: files.toReversed(),
      forceIndexForStaged: true
    })
    // Why: selection order is a product detail; accept either deterministic order.
    compare(ev, 'S9a-multi', actual, actual === rev ? rev : fwd)
    expect(toast).toContain(statsLine(actual))
    await page.keyboard.press('Escape')
  })

  await scenario('S10 Paste and Restore', async (ev) => {
    const absOutside = path.join(fixtureRoot, 'abs-escape.txt')
    const payload = [
      '// clipcode-root: MultiProduct',
      '// file: [NEW] WebApp/src/restored/a.ts',
      'export const restored = 1',
      '',
      '// file: [MODIFIED] api-server/README.md',
      '# restored api readme',
      '',
      '// file: [DELETED] libs/shared/core/extra.ts',
      '',
      '// file: [NEW] ../escape.txt',
      'escaped',
      '',
      `// file: [NEW] ${absOutside}`,
      'escaped',
      ''
    ].join('\n')
    await setClipboard(page, payload)
    await page.getByRole('button', { name: 'Paste & Restore' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    const dialogText = (await dialog.innerText()).replace(/\n+/g, '\n')
    ev.push(`dialog: ${JSON.stringify(dialogText)}`)
    await shot('S10-restore-dialog')
    // Each group block runs from its header to the next header; compare the exact path lists.
    const groupLines = (label: string) => {
      const m = dialogText.match(
        new RegExp(
          `^${label} \\(\\d+\\)\\n([\\s\\S]*?)(?=^(?:Create|Overwrite|Delete|Skip) \\(|$(?![\\s\\S]))`,
          'm'
        )
      )
      return (m?.[1] ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /\//.test(l))
    }
    expect(groupLines('Create')).toEqual(['WebApp/src/restored/a.ts'])
    expect(groupLines('Overwrite')).toEqual(['api-server/README.md'])
    expect(groupLines('Delete')).toEqual(['libs/shared/core/extra.ts'])
    const skipBlock = dialogText.slice(dialogText.indexOf('Skip ('))
    expect(skipBlock).toMatch(/^Skip \(2\)/)
    // The reason leads on its own line above the (wrappable) path.
    expect(skipBlock).toMatch(/(unsafe path|outside the folder)\s+\.\.\/escape\.txt/)
    expect(skipBlock).toMatch(/(unsafe path|outside the folder)\s+\S*abs-escape\.txt/)
    expect(skipBlock).not.toMatch(/restored\/a\.ts|README\.md|extra\.ts/)
    await expect(dialog.getByRole('button', { name: 'Restore' })).toBeEnabled()
    await dialog.getByLabel('Overwrite existing files').click()
    await dialog.getByRole('button', { name: 'Restore' }).click()
    await expect(dialog).toHaveCount(0, { timeout: 15_000 })
    await expect
      .poll(() => existsSync(path.join(R.webapp, 'src/restored/a.ts')), { timeout: 15_000 })
      .toBe(true)
    expect(readFileSync(path.join(R.webapp, 'src/restored/a.ts'), 'utf8')).toContain(
      'export const restored = 1'
    )
    await expect
      .poll(() => readFileSync(path.join(R.api, 'README.md'), 'utf8'), { timeout: 15_000 })
      .toContain('# restored api readme')
    await expect
      .poll(() => existsSync(path.join(R.core, 'extra.ts')), { timeout: 15_000 })
      .toBe(false)
    expect(existsSync(path.join(P, '..', 'escape.txt'))).toBe(false)
    expect(existsSync(path.join(P, 'escape.txt'))).toBe(false)
    expect(existsSync(absOutside)).toBe(false)
    const resultToast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Created 1, overwritten 1, deleted 1, skipped 2.' })
    await expect(resultToast).toHaveCount(1, { timeout: 10_000 })
    ev.push(`result toast: ${(await resultToast.innerText()).replace(/\s+/g, ' ')}`)
    // Overwrite unticked: the existing file must stay untouched.
    const keep = readFileSync(path.join(R.webapp, 'src/restored/a.ts'), 'utf8')
    await setClipboard(
      page,
      '// clipcode-root: MultiProduct\n// file: [MODIFIED] WebApp/src/restored/a.ts\nCLOBBER\n'
    )
    await page.getByRole('button', { name: 'Paste & Restore' }).first().click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible({ timeout: 15_000 })
    await expect(dialog2).toContainText('Overwrite (1)')
    await expect(dialog2.getByLabel('Overwrite existing files')).not.toBeChecked()
    // Why: with overwrite off the only entry is skipped, so there is nothing to restore.
    await expect(dialog2.getByRole('button', { name: 'Restore' })).toBeDisabled()
    await dialog2.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog2).toHaveCount(0, { timeout: 15_000 })
    expect(readFileSync(path.join(R.webapp, 'src/restored/a.ts'), 'utf8')).toBe(keep)
    ev.push('overwrite unticked: Restore disabled and existing file left untouched')
    ev.push(
      'on disk: a.ts created, api README overwritten, core/extra.ts deleted; escape.txt and absolute path file absent'
    )
  })

  const extra = {
    page,
    P,
    R,
    folderKey,
    refreshBtn,
    H,
    scenario,
    shot,
    header,
    entry,
    expandOnly,
    setClipboard,
    getOpenFiles,
    wtIdByPath,
    activeWt,
    copiedPayload,
    compare
  }
  await runRestoreScenarios(extra)
  await runLayoutScenarios(extra)
  await runExternalChangeScenarios(extra)
  await runAgentAndBannerScenarios(extra)

  await scenario('S11 Normal repo workspace regression', async (ev) => {
    const webWt = await wtIdByPath(R.webapp)
    expect(webWt).toBeTruthy()
    await page
      .locator(`[data-worktree-sidebar] [role="option"][data-worktree-id=${JSON.stringify(webWt)}]`)
      .click()
    await expect.poll(activeWt).toBe(webWt)
    await expect(page.getByRole('button', { name: 'Refresh all repositories' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy all changes' })).toHaveCount(0)
    await page.waitForTimeout(1000)
    await expect(page.getByRole('button', { name: 'Refresh all repositories' })).toHaveCount(0)
    const rel = 'src/unstaged-mod.ts'
    await expect(entry('unstaged', rel)).toHaveCount(1, { timeout: 20_000 })
    await entry('unstaged', rel).click()
    await expect(page.locator('.monaco-diff-editor').first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => diffText('modified'), { timeout: 15_000 }).toContain('unstaged-edit')
    const tab = (await getOpenFiles()).find(
      (f) => f.relativePath === rel && f.worktreeId === webWt && f.diffSource === 'unstaged'
    )
    ev.push(`tab: ${JSON.stringify(tab)}`)
    expect(tab).toBeTruthy()
    expect(tab!.filePath).toBe(path.join(R.webapp, rel))
    await shot('S11-repo-workspace')
  })

  await stopFrameCapture()
  writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2))
  expect(
    results.filter((r) => r.status === 'fail'),
    JSON.stringify(
      results.filter((r) => r.status === 'fail'),
      null,
      1
    )
  ).toEqual([])
})
