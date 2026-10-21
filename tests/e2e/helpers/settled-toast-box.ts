import type { Page } from '@stablyai/playwright-test'
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
