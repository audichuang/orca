import type { Locator, Page } from '@stablyai/playwright-test'
import { openFileExplorer } from './file-explorer'

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

// Paste & Restore lives in the File Explorer header; the Source Control toolbar no longer has it.
export async function clickExplorerPasteRestore(page: Page): Promise<void> {
  await openFileExplorer(page)
  await page.getByRole('button', { name: 'Paste & Restore' }).first().click()
}

export async function showSourceControl(page: Page): Promise<void> {
  await page.evaluate(() => window.__store!.getState().setRightSidebarTab('source-control'))
}

export type ExtraScenarioContext = {
  page: Page
  P: string
  R: { webapp: string; docs: string; api: string; core: string; feature: string }
  folderKey: string
  refreshBtn: Locator
  H: { api: RegExp; web: RegExp; docs: RegExp; feature: RegExp }
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
