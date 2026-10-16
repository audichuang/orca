import type { Locator, Page } from '@stablyai/playwright-test'

export type ScenarioResult = {
  name: string
  status: 'pass' | 'fail' | 'blocked'
  evidence: string[]
  error?: string
}

export async function clipboardText(page: Page): Promise<string> {
  return page.evaluate(() => window.api.ui.readClipboardText())
}
export async function setClipboard(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => window.api.ui.writeClipboardText(t), text)
}

export type ExtraScenarioContext = {
  page: Page
  P: string
  R: { webapp: string; docs: string; api: string; core: string; feature: string }
  folderKey: string
  refreshBtn: Locator
  H: { web: RegExp; docs: RegExp; feature: RegExp }
  scenario: (name: string, fn: (ev: string[]) => Promise<void>) => Promise<void>
  shot: (name: string) => Promise<string>
  header: (re: RegExp) => Locator
  entry: (area: string, p: string) => Locator
  expandOnly: (re: RegExp) => Promise<void>
  setClipboard: (page: Page, text: string) => Promise<void>
  getOpenFiles: () => Promise<
    { id: string; relativePath: string; worktreeId: string; diffSource: string | null }[]
  >
  wtIdByPath: (p: string) => Promise<string | null>
  activeWt: () => Promise<string | null>
  copiedPayload: () => Promise<{ actual: string; toast: string }>
  compare: (ev: string[], name: string, actual: string, expected: string) => void
}
