// Fork-only: real-layout guard that a folder repo row's hover actions never cover its change count.
import type { Locator } from '@stablyai/playwright-test'
import { expect } from './orca-app'

/** Leaves the pointer on the row so the caller can screenshot the hover state. */
export async function expectRowHoverKeepsCount(row: Locator, ev: string[]): Promise<void> {
  const countGeo = () =>
    row.evaluate((btn) => {
      const count = [...btn.querySelectorAll<HTMLElement>('span')].findLast((s) =>
        /^\d+$/.test(s.innerText.trim())
      )
      const copy = btn.parentElement?.querySelector('[aria-label="Copy all changes"]')
      const actions = copy?.parentElement
      if (!count || !actions) {
        return null
      }
      const c = count.getBoundingClientRect()
      const a = actions.getBoundingClientRect()
      const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)
      return {
        count: [c.left, c.right, c.top, c.bottom],
        actionsWidth: a.width,
        overlap: a.width > 0 && a.left < c.right && a.right > c.left,
        countOnTop: hit !== null && count.contains(hit),
        countOpacity: getComputedStyle(count).opacity
      }
    })
  const idle = await countGeo()
  await row.hover()
  await expect.poll(async () => (await countGeo())?.actionsWidth ?? 0).toBeGreaterThan(0)
  const hovered = await countGeo()
  ev.push(`count idle=${JSON.stringify(idle)} hovered=${JSON.stringify(hovered)}`)
  expect(idle, 'row shows a change count').not.toBeNull()
  expect(hovered?.count, 'count does not move on hover').toEqual(idle?.count)
  expect(hovered?.overlap, 'actions do not overlap the count').toBe(false)
  expect(hovered?.countOnTop, 'count is not covered on hover').toBe(true)
  expect(hovered?.countOpacity).toBe('1')
}
