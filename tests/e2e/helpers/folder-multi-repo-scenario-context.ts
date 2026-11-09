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

/** Opens a repo-owned edit tab placed in the folder, as upstream's folder Source Control does. */
export async function openRepoEditTabInFolder(
  page: Page,
  file: { filePath: string; relativePath: string; ownerWorktreeId: string; folderKey: string },
  language: string
): Promise<string> {
  return page.evaluate(
    ({ filePath, relativePath, ownerWorktreeId, folderKey, language }) => {
      const s = window.__store!.getState()
      // Why: earlier scenarios leave tabs and a split group; the one editor on screen must be this tab's.
      s.closeAllFiles()
      s.openFile(
        { filePath, relativePath, worktreeId: ownerWorktreeId, language, mode: 'edit' },
        {
          placementWorkspaceId: folderKey,
          targetGroupId: window.__store!.getState().activeGroupIdByWorktree[folderKey],
          preview: false
        }
      )
      const id = window
        .__store!.getState()
        .openFiles.find((f) => f.filePath === filePath && f.mode === 'edit')?.id
      if (!id) {
        throw new Error('edit tab did not open')
      }
      return id
    },
    { ...file, language }
  )
}

/** Clears every row multi-selection; a right-clicked row stays selected after its menu closes. */
export async function clearSourceControlSelections(page: Page): Promise<void> {
  const clear = page.getByRole('button', { name: 'Clear selection' })
  for (let i = 0; i < 5 && (await clear.count()) > 0; i++) {
    await clear.first().click()
  }
}

export type RepoKey = 'api' | 'core' | 'docs' | 'web' | 'feature'

export type ExtraScenarioContext = {
  page: Page
  P: string
  R: { webapp: string; docs: string; api: string; core: string; feature: string }
  folderKey: string
  refreshBtn: Locator
  H: { [K in RepoKey]: K }
  scenario: (name: string, fn: (ev: string[]) => Promise<void>) => Promise<void>
  shot: (name: string) => Promise<string>
  /** The repo's card in upstream's folder Source Control. */
  card: (key: RepoKey) => Locator
  /** A Source Control row in the card expandOnly last focused. */
  entry: (area: string, p: string) => Locator
  /** Expands the repo's card and scopes entry() to it. */
  expandOnly: (key: RepoKey) => Promise<void>
  setClipboard: (page: Page, text: string) => Promise<void>
  getOpenFiles: () => Promise<
    { id: string; relativePath: string; worktreeId: string; diffSource: string | null }[]
  >
  wtIdByPath: (p: string) => Promise<string | null>
  activeWt: () => Promise<string | null>
  copiedPayload: () => Promise<{ actual: string; toast: string }>
  compare: (ev: string[], name: string, actual: string, expected: string) => void
}
