import { expect } from './orca-app'
import { runBinaryAndKeyboardScenarios } from './folder-multi-repo-binary-and-keyboard-scenarios'
import { expectRowHoverKeepsCount } from './folder-repo-row-hover-count-check'
import type { ExtraScenarioContext } from './folder-multi-repo-scenario-context'

// S15-S16: open-to-the-side and master-detail layout; then S17-S18.
export async function runLayoutScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const {
    page,
    folderKey,
    H,
    scenario,
    shot,
    entry,
    expandOnly,
    setClipboard,
    getOpenFiles,
    activeWt
  } = ctx
  await scenario('S15 Open to the Side opens a split group', async (ev) => {
    await expandOnly(H.web)
    const groups = () =>
      page.evaluate((k) => {
        const s = window.__store!.getState()
        return {
          ids: (s.groupsByWorktree[k] ?? []).map((g) => g.id),
          active: s.activeGroupIdByWorktree[k] ?? null,
          tabs: (s.unifiedTabsByWorktree[k] ?? []).map((t) => ({
            id: t.id,
            entityId: t.entityId,
            groupId: t.groupId
          }))
        }
      }, folderKey)
    const before = await groups()
    const rel = 'src/unstaged-mod.ts'
    await entry('unstaged', rel).click({ button: 'right' })
    const item = page.getByRole('menuitem', { name: /^Open to the Side/ })
    await expect(item).toBeVisible()
    await shot('S15a-context-menu')
    await item.click()
    await expect
      .poll(async () => (await groups()).ids.length, { timeout: 15_000 })
      .toBe(before.ids.length + 1)
    const after = await groups()
    const newGroup = after.ids.find((id) => !before.ids.includes(id))!
    const file = (await getOpenFiles()).find(
      (f) => f.relativePath === rel && f.diffSource === 'unstaged'
    )
    ev.push(`before=${JSON.stringify(before.ids)} after=${JSON.stringify(after)} file=${file?.id}`)
    expect(file?.worktreeId).toBe(folderKey)
    expect(after.tabs.some((t) => t.entityId === file?.id && t.groupId === newGroup)).toBe(true)
    expect(await activeWt()).toBe(folderKey)
    await expect(page.locator('.monaco-diff-editor').first()).toBeVisible({ timeout: 20_000 })
    await shot('S15b-split-opened')
    // The right-clicked row stays selected after the menu action; start the multi-select from none.
    await page.getByRole('button', { name: 'Clear selection' }).click()
    // Ctrl/Cmd-click must still only multi-select, never create another split.
    const groupCount = after.ids.length
    await entry('unstaged', 'src/partial.ts').click({ modifiers: ['ControlOrMeta'] })
    await entry('unstaged', 'README.md').click({ modifiers: ['ControlOrMeta'] })
    await expect(page.getByText(/^2 selected$/)).toBeVisible({ timeout: 10_000 })
    expect((await groups()).ids.length).toBe(groupCount)
    ev.push('ctrl-click: 2 selected, group count unchanged')
    await shot('S15c-ctrl-click-multiselect')
    await page.keyboard.press('Escape')
  })

  await scenario('S16 Layout: repo rows, open repo fills height, bulk bar', async (ev) => {
    await expandOnly(H.web)
    const geo = await page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-repo-row]')]
      const root = rows[0]?.closest<HTMLElement>('[role="group"]')
      // One scrolling repo list, then the open repo's panel pinned below it.
      const list = document.querySelector<HTMLElement>('[data-folder-repo-list]')
      const detail = document.querySelector<HTMLElement>('[data-folder-repo-detail]')
      if (!list || !root || !detail) {
        return null
      }
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }
      }
      const hit = (b: Element) => {
        const r = b.getBoundingClientRect()
        const xs = [r.left + r.width * 0.2, r.left + r.width / 2, r.right - r.width * 0.2]
        const ys = [r.top + r.height * 0.2, r.top + r.height / 2, r.bottom - r.height * 0.2]
        return xs.every((x) => ys.every((y) => b.contains(document.elementFromPoint(x, y))))
      }
      const rowHits = rows.map((btn) => {
        const row = btn.parentElement!
        const lr = row.parentElement!.getBoundingClientRect()
        return {
          label: btn.innerText.replace(/\s+/g, ' ').trim(),
          insideList:
            row.getBoundingClientRect().top >= lr.top - 1 &&
            row.getBoundingClientRect().bottom <= lr.bottom + 1,
          // Why: eye/copy sit in a hover-only overlay that ignores the pointer until hovered.
          targets: [...row.querySelectorAll('button')]
            .filter((b) => getComputedStyle(b).pointerEvents !== 'none')
            .map((b) => {
              return {
                name: b.getAttribute('aria-label') || b.getAttribute('title') || 'row',
                ok: hit(b)
              }
            })
        }
      })
      const dr = detail.getBoundingClientRect()
      const visible = [...detail.querySelectorAll<HTMLElement>('button,input,textarea')].filter(
        (e) => {
          const r = e.getBoundingClientRect()
          // Disabled controls are inert (pointer-events: none) by design, so they cannot be "covered".
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.top >= dr.top &&
            r.bottom <= dr.bottom &&
            getComputedStyle(e).pointerEvents !== 'none'
          )
        }
      )
      const first = visible[0]
      return {
        sidebarWidth: root.getBoundingClientRect().width,
        list: box(list),
        listClipped: list.scrollHeight - list.clientHeight,
        root: box(root),
        detail: box(detail),
        detailChild: detail.lastElementChild ? box(detail.lastElementChild) : null,
        firstContentGap: first ? first.getBoundingClientRect().top - dr.top : null,
        rowHits,
        detailCovered: visible
          .filter((b) => !b.closest('[data-testid="source-control-entry"]'))
          .map((b) => {
            const r = b.getBoundingClientRect()
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            // Why: the draggable floating-workspace launcher overlays whatever sits in its window-corner spot.
            const launcher = document
              .querySelector('[data-floating-terminal-toggle]')
              ?.getBoundingClientRect()
            const underLauncher =
              launcher !== undefined &&
              r.left < launcher.right &&
              r.right > launcher.left &&
              r.top < launcher.bottom &&
              r.bottom > launcher.top
            return hit(b) || underLauncher
              ? null
              : `${b.getAttribute('aria-label') || b.innerText.trim() || b.tagName} covered by ${top?.tagName}.${String(top?.className).slice(0, 80)}`
          })
          .filter(Boolean)
      }
    })
    ev.push(`geometry: ${JSON.stringify(geo)}`)
    expect(geo).not.toBeNull()
    const g = geo!
    expect(g.rowHits).toHaveLength(5)
    for (const r of g.rowHits) {
      expect(r.insideList, `${r.label} is clipped by the list`).toBe(true)
      expect(r.targets.length, `${r.label} has a clickable row button`).toBeGreaterThanOrEqual(1)
      expect(
        r.targets.filter((t) => !t.ok),
        `${r.label} actions are hit-testable`
      ).toEqual([])
    }
    expect(g.listClipped, 'list scrolls internally with 5 repos').toBe(0)
    // The open repo's panel starts right under the list and runs to the panel bottom.
    expect(Math.abs(g.detail.top - g.list.bottom)).toBeLessThanOrEqual(6)
    expect(Math.abs(g.detail.bottom - g.root.bottom)).toBeLessThanOrEqual(2)
    expect(g.detail.h).toBeGreaterThan(g.root.bottom - g.root.top - g.list.h - 120)
    expect(
      g.detailChild!.bottom,
      'selected repo panel fills the detail area under its header'
    ).toBeGreaterThanOrEqual(g.detail.bottom - 2)
    expect(g.firstContentGap, 'no large gap above the repo panel content').not.toBeNull()
    expect(g.firstContentGap!).toBeLessThan(48)
    expect(g.detailCovered, 'detail actions are not covered by floating UI').toEqual([])
    await shot('S16a-list-and-detail')

    // Hovering a row with changes reveals eye/copy beside the count without moving or covering it.
    await expectRowHoverKeepsCount(
      page.locator('[data-repo-row]').filter({ hasText: H.web }).first(),
      ev
    )
    await shot('S16a1-row-hover-count')
    await page.mouse.move(0, 0)

    // Clicking the open row keeps it open, so the panel below is never left blank.
    const openHeader = page.locator('[data-repo-row][aria-current="true"]')
    const webHeader = page.locator('[data-repo-row]').filter({ hasText: H.web }).first()
    await webHeader.click()
    await expect(openHeader).toHaveCount(1)
    await expect(webHeader).toHaveAttribute('aria-current', 'true')
    await expect(entry('unstaged', 'src/partial.ts')).toBeVisible({ timeout: 10_000 })
    await shot('S16a2-open-row-reclicked')

    // Bulk action bar: anchored to the detail, not covered, label on one line.
    await entry('unstaged', 'src/partial.ts').click({ modifiers: ['ControlOrMeta'] })
    await entry('unstaged', 'README.md').click({ modifiers: ['ControlOrMeta'] })
    const barCopy = page.getByRole('button', { name: 'Copy Full Source' }).last()
    await expect(barCopy).toBeVisible()
    const barGeo = () =>
      page.evaluate(() => {
        const copy = [...document.querySelectorAll('button')].findLast(
          (b) => b.getAttribute('aria-label') === 'Copy Full Source'
        )
        const bar = copy?.closest<HTMLElement>('div.absolute.bottom-0')
        if (!bar) {
          return { error: 'bulk bar not found' }
        }
        const detail = bar.parentElement!.getBoundingClientRect()
        const br = bar.getBoundingClientRect()
        const label = [...bar.querySelectorAll<HTMLElement>('span')].find((e) =>
          /^\d+\s+selected$/.test(e.innerText.trim())
        )!
        const lr = label.getBoundingClientRect()
        const btns = [...bar.querySelectorAll<HTMLElement>('button')]
        const hit = (b: Element) => {
          const r = b.getBoundingClientRect()
          const xs = [r.left + r.width * 0.2, r.left + r.width / 2, r.right - r.width * 0.2]
          const ys = [r.top + r.height * 0.2, r.top + r.height / 2, r.bottom - r.height * 0.2]
          return xs.every((x) => ys.every((y) => b.contains(document.elementFromPoint(x, y))))
        }
        return {
          barBox: [br.left, br.right, br.top, br.bottom],
          detailBox: [detail.left, detail.right, detail.top, detail.bottom],
          labelText: label.innerText,
          labelLines: label.getClientRects().length,
          labelHeight: lr.height,
          labelClipped: label.scrollWidth > label.clientWidth,
          rowSpread: Math.max(
            ...btns.map((b) =>
              Math.abs(
                b.getBoundingClientRect().top +
                  b.getBoundingClientRect().height / 2 -
                  (lr.top + lr.height / 2)
              )
            )
          ),
          inDetail:
            br.left >= detail.left - 1 &&
            br.right <= detail.right + 1 &&
            br.bottom <= detail.bottom + 1,
          results: btns.map((b) => ({
            label: (b.innerText || b.getAttribute('aria-label') || 'icon').trim(),
            inBar: hit(b),
            clipped: b.scrollWidth > b.clientWidth
          }))
        }
      })
    // Why: the bar slides in; measure after the animation settles.
    await expect
      .poll(async () => ('inDetail' in (await barGeo()) ? (await barGeo()).inDetail : null), {
        timeout: 5_000
      })
      .toBe(true)
    const bar0 = await barGeo()
    ev.push(`bulk bar (default width ${g.sidebarWidth}px): ${JSON.stringify(bar0)}`)
    expect('error' in bar0 ? bar0.error : '').toBe('')
    if ('results' in bar0) {
      expect(bar0.labelText).toMatch(/^2\s+selected$/)
      expect(bar0.labelLines, 'selected label wraps').toBe(1)
      expect(bar0.labelHeight, 'selected label is one line tall').toBeLessThan(20)
      expect(bar0.labelClipped, 'selected label is not clipped').toBe(false)
      expect(bar0.rowSpread, 'label and buttons share one row').toBeLessThanOrEqual(4)
      expect(
        (bar0.results ?? []).filter((r) => r.clipped),
        'button labels are not clipped'
      ).toEqual([])
      expect(bar0.inDetail).toBe(true)
      expect((bar0.results ?? []).length).toBeGreaterThanOrEqual(2)
      expect((bar0.results ?? []).filter((r) => !r.inBar)).toEqual([])
    }
    await shot('S16b-bulk-bar')
    // With a toast on screen the bar must stay hit-testable.
    await setClipboard(page, 'sentinel')
    await barCopy.click()
    await expect(page.locator('[data-sonner-toast]').first()).toBeVisible({ timeout: 10_000 })
    if (!(await barCopy.isVisible())) {
      await entry('unstaged', 'src/partial.ts').click({ modifiers: ['ControlOrMeta'] })
      await entry('unstaged', 'README.md').click({ modifiers: ['ControlOrMeta'] })
    }
    await expect(barCopy).toBeVisible()
    const bar1 = await barGeo()
    ev.push(`bulk bar with toast: ${JSON.stringify(bar1)}`)
    expect('error' in bar1 ? bar1.error : '').toBe('')
    if ('results' in bar1) {
      expect((bar1.results ?? []).filter((r) => !r.inBar)).toEqual([])
      expect(bar1.rowSpread).toBeLessThanOrEqual(4)
    }
    await shot('S16c-bulk-bar-with-toast')
    await page.keyboard.press('Escape')
  })
  await runBinaryAndKeyboardScenarios(ctx)
}
