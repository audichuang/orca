import type { Locator, Page } from '@stablyai/playwright-test'
import { expect } from './orca-app'

/** The front sonner toast's box once it stops moving; a toast is visible while still sliding in. */
export async function settledToastBox(page: Page): Promise<{ top: number; bottom: number }> {
  const toast = page.locator('[data-sonner-toast]').first()
  const box = () =>
    toast.evaluate((t) => {
      const { top, bottom } = t.getBoundingClientRect()
      return { top, bottom }
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
export async function expectCopyToastLeavesClickable(
  page: Page,
  targets: Locator[]
): Promise<void> {
  const live = page
    .locator('[data-sonner-toast][data-removed="false"]')
    .filter({ hasText: /file\(s\) copied/ })
  // Why 2s: a replaced toast leaves after sonner's 200ms exit; a stacked one stays its 4s lifetime.
  await expect(live, 'Copy Full Source toasts on screen').toHaveCount(1, { timeout: 2_000 })
  for (const target of targets) {
    // Why trial: it runs the real click's hit-target check (scrolling included) without acting.
    await target.click({ trial: true, timeout: 5_000 })
  }
}
