import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect } from './orca-app'
import {
  expectedPayload,
  git,
  gitRaw,
  isBinary,
  readStatus,
  statsLine
} from './folder-multi-repo-expectations'
import type { ExtraScenarioContext } from './folder-multi-repo-scenario-context'

// S17-S19: binary-to-text copy, keyboard selection and multi-select context-menu copy.
export async function runBinaryAndKeyboardScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const {
    page,
    R,
    refreshBtn,
    H,
    scenario,
    shot,
    entry,
    expandOnly,
    setClipboard,
    copiedPayload,
    compare
  } = ctx
  await scenario('S17 Binary to text change copies the index text', async (ev) => {
    const rel = 'bin.dat'
    writeFileSync(path.join(R.docs, rel), Buffer.from([0x89, 0x00, 0x01, 0x02, 0x00, 0xff]))
    git(R.docs, 'add', rel)
    git(R.docs, 'commit', '-qm', 'add binary')
    writeFileSync(path.join(R.docs, rel), 'now plain text\nsecond line\n')
    git(R.docs, 'add', rel)
    expect(readStatus(R.docs)).toEqual([{ area: 'staged', code: 'M', path: rel }])
    expect(isBinary(gitRaw(R.docs, 'show', `HEAD:${rel}`))).toBe(true)
    await refreshBtn.click()
    await expandOnly(H.docs)
    await expect(entry('staged', rel)).toHaveCount(1, { timeout: 20_000 })
    await setClipboard(page, 'sentinel')
    await entry('staged', rel).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Copy Full Source' }).click()
    const { actual } = await copiedPayload()
    const expected = expectedPayload({
      rootName: 'MultiProduct',
      files: [
        { repoDir: 'docs-site', repoAbs: R.docs, entry: { area: 'staged', code: 'M', path: rel } }
      ],
      forceIndexForStaged: true
    })
    compare(ev, 'S17-binary-to-text', actual, expected)
    expect(actual).toContain('// file: [MODIFIED] docs-site/bin.dat')
    expect(actual).toContain('now plain text')
    await shot('S17-binary-to-text')
  })

  await scenario('S18 Keyboard: ArrowDown selects the next repo', async (ev) => {
    const rows = page.locator('[data-repo-row]')
    const selected = page.locator('[data-repo-row][aria-current="true"]')
    const labels = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
    expect(labels[0]).toMatch(/^api-server main\b/)
    expect(labels[1]).toMatch(/^core main\b/)
    await rows.first().click()
    await expect(selected).toHaveCount(1)
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
    await rows.first().focus()
    await expect(rows.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
    await expect(rows.nth(1)).toBeFocused()
    await expect(selected).toHaveCount(1)
    // The next repo's own panel shows its changes, not the previous repo's.
    const coreFirst = readStatus(R.core)[0]!
    const apiFirst = readStatus(R.api)[0]!
    await expect(entry(coreFirst.area, coreFirst.path)).toHaveCount(1, { timeout: 15_000 })
    await expect(entry(apiFirst.area, apiFirst.path)).toHaveCount(0)
    ev.push(`ArrowDown: ${labels[0]} -> ${labels[1]}; panel shows ${coreFirst.path}`)
    await shot('S18a-arrowdown')
    // List keys: End/Home move focus and select; Enter on the open repo keeps it open.
    await page.keyboard.press('End')
    await expect(rows.last()).toBeFocused()
    await expect(rows.last()).toHaveAttribute('aria-current', 'true')
    await page.keyboard.press('Home')
    await expect(rows.first()).toBeFocused()
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
    await page.keyboard.press('Enter')
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
    await expect(selected).toHaveCount(1)
    await expect(rows.first()).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
    // The detail toolbar names the selected repo.
    await expect(
      page
        .locator('[data-testid="source-control-filter-toggle"]')
        .locator('xpath=preceding-sibling::span[contains(., "api-server")]')
    ).toHaveCount(1)
    ev.push('End/Home/ArrowUp clamp and move selection with focus')
    await shot('S18b-home-end')
  })
  await scenario('S19 Context menu on a multi-selection copies every selected file', async (ev) => {
    await expandOnly(H.web)
    const clear = page.getByRole('button', { name: 'Clear selection' })
    if (await clear.count()) {
      await clear.click()
    }
    const rows = [
      { area: 'unstaged', p: 'src/partial.ts' },
      { area: 'unstaged', p: 'src/deleted-unstaged.ts' }
    ]
    await setClipboard(page, 'sentinel')
    await entry(rows[0]!.area, rows[0]!.p).click({ modifiers: ['ControlOrMeta'] })
    await entry(rows[1]!.area, rows[1]!.p).click({ modifiers: ['ControlOrMeta'] })
    // Right-click a row that is already part of the selection.
    await entry(rows[1]!.area, rows[1]!.p).click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Copy Full Source' })).toBeVisible()
    await page.waitForTimeout(400) // menu open animation
    await shot('S19-multi-context-menu')
    await page.getByRole('menuitem', { name: 'Copy Full Source' }).click()
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
    compare(ev, 'S19-multi-context', actual, actual === rev ? rev : fwd)
    expect(toast).toContain(statsLine(actual))
    // Selection outlives the menu; later scenarios assume none.
    // Why wait: the copy toast can sit over Clear selection and swallow the click.
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 })
    await page.getByRole('button', { name: 'Clear selection' }).click()
  })
}
