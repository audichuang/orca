import type { Locator, Page } from '@stablyai/playwright-test'
import { expect } from './orca-app'

type ToastBox = { top: number; bottom: number; left: number; right: number }

/** A sonner toast's box once it stops moving (the front one by default); a toast is visible while still sliding in. */
export async function settledToastBox(
  page: Page,
  toast: Locator = page.locator('[data-sonner-toast]').first()
): Promise<ToastBox> {
  const box = () =>
    toast.evaluate((t) => {
      const { top, bottom, left, right } = t.getBoundingClientRect()
      return { top, bottom, left, right }
    })
  let lastTop = Number.NaN
  await expect
    .poll(
      async () => {
        const { top } = await box()
        const settled = Math.round(top) === lastTop
        lastTop = Math.round(top)
        return settled
      },
      { intervals: [200], timeout: 10_000 }
    )
    .toBe(true)
  return box()
}

/** Fork layout check: one Copy Full Source toast at a time, and it leaves the given targets clickable. */
export async function expectCopyToastClears(page: Page, targets: Locator[]): Promise<void> {
  const live = page
    .locator('[data-sonner-toast][data-removed="false"]')
    .filter({ hasText: /file\(s\) copied/ })
  // Why 2s: a replaced toast leaves after sonner's 200ms exit; a stacked one stays its 4s lifetime.
  await expect(live, 'Copy Full Source toasts on screen').toHaveCount(1, { timeout: 2_000 })
  const toast = await settledToastBox(page, live)
  for (const target of targets) {
    const box = await target.boundingBox()
    expect(box, `${target} is laid out`).not.toBeNull()
    const covered =
      box !== null &&
      box.x < toast.right &&
      toast.left < box.x + box.width &&
      box.y < toast.bottom &&
      toast.top < box.y + box.height
    expect(covered, `copy toast ${JSON.stringify(toast)} covers ${target}`).toBe(false)
  }
}
