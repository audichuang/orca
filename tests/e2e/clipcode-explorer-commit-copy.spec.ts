// Fork-only: ClipCode Copy Full Source from the file explorer and from a multi-selection of commit files.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { openFileExplorer } from './helpers/file-explorer'
import {
  clickExplorerPasteRestore,
  clipboardText,
  clipcodeNonTextDialog,
  setClipboard
} from './helpers/folder-multi-repo-scenario-context'
import { waitForSessionReady } from './helpers/store'
import { openSourceControlForWorktree } from './helpers/worktree-registration'

const SHOTS_DIR = process.env.ORCA_E2E_SHOTS_DIR ?? path.join(os.tmpdir(), 'orca-clipcode-shots')
// Why both: the selection modifier is Cmd on macOS and Ctrl elsewhere.
const MULTI_SELECT = process.platform === 'darwin' ? 'Meta' : 'Control'

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' })
}

function writeFiles(root: string, files: Record<string, string | Buffer>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
}

function createWorktree(
  testRepoPath: string,
  label: string,
  registerCleanup: (cleanup: () => Promise<void>) => void
): string {
  const branch = `e2e-clipcode-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const worktreePath = path.join(os.tmpdir(), branch)
  git(testRepoPath, ['worktree', 'add', worktreePath, '-b', branch])
  registerCleanup(async () => {
    try {
      git(testRepoPath, ['worktree', 'remove', '--force', worktreePath])
    } catch {
      rmSync(worktreePath, { recursive: true, force: true })
      git(testRepoPath, ['worktree', 'prune'])
    }
    try {
      git(testRepoPath, ['branch', '-D', branch])
    } catch {}
  })
  return worktreePath
}

async function copyFromMenu(page: Page, row: Locator): Promise<string> {
  await startCopyFromMenu(page, row)
  await expect.poll(() => clipboardText(page), { timeout: 20_000 }).not.toBe('sentinel')
  return clipboardText(page)
}

async function startCopyFromMenu(page: Page, row: Locator): Promise<void> {
  await setClipboard(page, 'sentinel')
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy Full Source' }).click()
}

/** Answers the non-text question after checking how many files it lists; the clipboard is written only then. */
async function answerNonTextDialog(
  page: Page,
  expectedFiles: number,
  choice: 'Include' | 'Exclude',
  shot?: string
): Promise<string> {
  const dialog = clipcodeNonTextDialog(page)
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(dialog.getByRole('listitem')).toHaveCount(expectedFiles)
  expect(await clipboardText(page)).toBe('sentinel')
  if (shot) {
    await page.screenshot({ path: path.join(SHOTS_DIR, shot), animations: 'disabled' })
  }
  await dialog.getByRole('button', { name: choice, exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => clipboardText(page), { timeout: 20_000 }).not.toBe('sentinel')
  return clipboardText(page)
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function restorePreview(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: 'Restore', exact: true }) })
}

async function pasteAndRestore(page: Page, payload: string, shot: string): Promise<Locator> {
  await setClipboard(page, payload)
  await clickExplorerPasteRestore(page)
  const dialog = restorePreview(page)
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: path.join(SHOTS_DIR, shot), animations: 'disabled' })
  return dialog
}

test('explorer Copy Full Source copies a folder recursively and a multi-selection of files', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const worktreePath = createWorktree(testRepoPath, 'explorer', registerPostElectronShutdownCleanup)
  writeFiles(worktreePath, {
    'clip/alpha.ts': 'export const alpha = 1\n',
    'clip/nested/beta.ts': 'export const beta = 2\n',
    'clip/node_modules/dep/index.js': 'module.exports = 1\n',
    'clip-other/gamma.ts': 'export const gamma = 3\n',
    // A label mid-path is plain text to the parser, so this one restores as itself and is copied.
    'clip-other/[DELETED] kept.ts': 'kept\n',
    // At the root the header would read back as "delete victim.ts" on Paste & Restore.
    '[DELETED] victim.ts': 'must not be copied\n'
  })
  writeFileSync(path.join(worktreePath, 'clip/blob.bin'), Buffer.from([0, 1, 2, 3]))

  mkdirSync(SHOTS_DIR, { recursive: true })
  await waitForSessionReady(orcaPage)
  // Activates the worktree; the explorer tab is opened right after.
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)
  await openFileExplorer(orcaPage)
  const explorer = orcaPage.locator('[data-orca-explorer-shell]')
  const row = (name: string): Locator =>
    explorer
      .locator('[data-file-explorer-row]')
      .filter({ has: orcaPage.getByText(name, { exact: true }) })
      .first()
  await expect(row('clip-other')).toBeVisible({ timeout: 20_000 })

  await startCopyFromMenu(orcaPage, row('clip'))
  // Exclude is the payload Copy Full Source produced before non-text files could be carried.
  const folderPayload = await answerNonTextDialog(orcaPage, 1, 'Exclude')
  const rootLine = `// clipcode-root: ${path.basename(worktreePath)}`
  expect(folderPayload.split('\n')[0]).toBe(rootLine)
  // Explorer order: sub-folders first, hidden node_modules and binary files left out.
  expect(folderPayload).toBe(
    [
      rootLine,
      '',
      '// file: clip/nested/beta.ts',
      'export const beta = 2\n',
      '',
      '// file: clip/alpha.ts',
      'export const alpha = 1\n',
      '',
      ''
    ].join('\n')
  )
  await expect(
    orcaPage.locator('[data-sonner-toast]').filter({ hasText: /2 file\(s\) copied/ })
  ).toBeVisible({ timeout: 10_000 })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '01-explorer-folder-copied.png') })

  await row('clip-other').click()
  await row('README.md').click({ modifiers: [MULTI_SELECT] })
  await row('[DELETED] victim.ts').click({ modifiers: [MULTI_SELECT] })
  const selectionPayload = await copyFromMenu(orcaPage, row('README.md'))
  expect(selectionPayload).toContain('// file: clip-other/gamma.ts\nexport const gamma = 3\n')
  expect(selectionPayload).toContain('// file: README.md\n')
  expect(selectionPayload).not.toContain('clip/alpha.ts')
  expect(selectionPayload).toContain('// file: clip-other/[DELETED] kept.ts\nkept\n')
  expect(selectionPayload).not.toContain('victim.ts')
  await expect(
    orcaPage.locator('[data-sonner-toast]').filter({ hasText: /Name not portable: 1/ })
  ).toBeVisible({ timeout: 10_000 })
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '03-explorer-selection-copied.png') })
})

test('Ctrl/Cmd-click selects commit files without opening them and copies just those', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const worktreePath = createWorktree(testRepoPath, 'commit', registerPostElectronShutdownCleanup)
  writeFiles(worktreePath, {
    'multi/one.ts': 'export const one = 1\n',
    'multi/two.ts': 'export const two = 2\n',
    'multi/three.ts': 'export const three = 3\n'
  })
  git(worktreePath, ['add', '.'])
  git(worktreePath, ['commit', '-m', 'ClipCode multi-select fixture'])

  mkdirSync(SHOTS_DIR, { recursive: true })
  await waitForSessionReady(orcaPage)
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)
  const historyRows = orcaPage.getByTestId('git-history-row')
  if (
    !(await historyRows
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await orcaPage.getByRole('button', { name: /Commits/ }).click()
  }
  const commitRow = historyRows.filter({ hasText: 'ClipCode multi-select fixture' }).first()
  await expect(commitRow).toBeVisible({ timeout: 20_000 })
  await commitRow.click()
  const files = orcaPage.getByTestId('git-history-commit-file')
  const file = (name: string): Locator => files.filter({ hasText: name }).first()
  await expect(file('three.ts')).toBeVisible({ timeout: 15_000 })

  await file('one.ts').click({ modifiers: [MULTI_SELECT] })
  await file('three.ts').click({ modifiers: [MULTI_SELECT] })
  await expect(files.and(orcaPage.locator('[data-selected]'))).toHaveCount(2)
  // A selection click must not open the diff.
  await expect(orcaPage.locator('.monaco-diff-editor')).toHaveCount(0)
  await orcaPage.screenshot({ path: path.join(SHOTS_DIR, '02-commit-files-selected.png') })

  const payload = await copyFromMenu(orcaPage, file('three.ts'))
  expect(payload).toContain('// file: [NEW] multi/one.ts\nexport const one = 1\n')
  expect(payload).toContain('// file: [NEW] multi/three.ts\nexport const three = 3\n')
  expect(payload).not.toContain('multi/two.ts')
})

// Hardcoded bytes and SHA-256 (computed once, never by app code): a PNG and an empty zip carry NUL bytes,
// the Big5 CSV is NUL-free but not UTF-8.
const NON_TEXT_FIXTURE = {
  'assets/logo.png': {
    bytes: Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082',
      'hex'
    ),
    sha256: '4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5'
  },
  'docs/report.docx': {
    bytes: Buffer.from(`504b0506${'00'.repeat(18)}`, 'hex'),
    sha256: '8739c76e681f900923b900c9df0ef75cf421d39cabb54650c4b9ad19b6a76d85'
  },
  'data/sales-big5.csv': {
    bytes: Buffer.from('ab7ea6572cbcc6b6710ac4abaa472c330aadbbbfbc2c350a', 'hex'),
    sha256: '5fb2179f991d4aae20210b0a22c0c22b5b91bdf353a4ae11a453393131649d36'
  }
}

// Payloads from the OpenIDEA contract fixture (nonTextRestoreCases), as another ClipCode tool writes them.
const OPENIDEA_PNG_BASE64_LINES =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACx\njwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQ=\n'
const OPENIDEA_PNG_SHA256 = '3067f3a1a846d709d1b4aa1e3226be6fd0227a2c2343a0be64ee2be2ef646f90'
const OPENIDEA_PNG_PAYLOAD = `\n// file: public/static/logo.png\n// File skipped: non-text file, 83 bytes, sha256 ${OPENIDEA_PNG_SHA256}; base64 follows\n${OPENIDEA_PNG_BASE64_LINES}\n`
const OPENIDEA_WRONG_SHA_PAYLOAD = `\n// file: sha.png\n// File skipped: non-text file, 83 bytes, sha256 ${'0'.repeat(64)}; base64 follows\n${OPENIDEA_PNG_BASE64_LINES}\n// file: src/ok.ts\nok\n\n`

test('non-text files survive Copy Full Source with Include and Paste & Restore byte for byte', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const worktreePath = createWorktree(testRepoPath, 'nontext', registerPostElectronShutdownCleanup)
  const folder = path.join(worktreePath, 'nt')
  writeFiles(folder, {
    ...Object.fromEntries(
      Object.entries(NON_TEXT_FIXTURE).map(([file, { bytes }]) => [file, bytes])
    ),
    'README.md': '# sample\n\ntext file\n'
  })

  mkdirSync(SHOTS_DIR, { recursive: true })
  await waitForSessionReady(orcaPage)
  await openSourceControlForWorktree(orcaPage, testRepoPath, worktreePath)
  await openFileExplorer(orcaPage)
  const explorer = orcaPage.locator('[data-orca-explorer-shell]')
  const ntRow = explorer
    .locator('[data-file-explorer-row]')
    .filter({ has: orcaPage.getByText('nt', { exact: true }) })
    .first()
  await expect(ntRow).toBeVisible({ timeout: 20_000 })

  await startCopyFromMenu(orcaPage, ntRow)
  const payload = await answerNonTextDialog(orcaPage, 3, 'Include', '04-non-text-copy-dialog.png')
  expect(payload).toContain('// file: nt/README.md\n# sample\n')
  for (const file of Object.keys(NON_TEXT_FIXTURE)) {
    expect(payload).toContain(`// file: nt/${file}\n`)
  }

  // Restore into the folder emptied after the copy, so every file has to be written from the payload.
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder)
  const preview = await pasteAndRestore(orcaPage, payload, '05-non-text-restore-preview.png')
  await preview.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(preview).toHaveCount(0, { timeout: 15_000 })
  for (const [file, { sha256: expected }] of Object.entries(NON_TEXT_FIXTURE)) {
    const restored = path.join(folder, file)
    await expect.poll(() => existsSync(restored), { timeout: 15_000 }).toBe(true)
    expect(sha256(restored), file).toBe(expected)
  }

  const openIdeaPreview = await pasteAndRestore(
    orcaPage,
    OPENIDEA_PNG_PAYLOAD,
    '06-openidea-png-restore-preview.png'
  )
  await openIdeaPreview.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(openIdeaPreview).toHaveCount(0, { timeout: 15_000 })
  const logo = path.join(worktreePath, 'public/static/logo.png')
  await expect.poll(() => existsSync(logo), { timeout: 15_000 }).toBe(true)
  expect(sha256(logo)).toBe(OPENIDEA_PNG_SHA256)

  const corruptPreview = await pasteAndRestore(
    orcaPage,
    OPENIDEA_WRONG_SHA_PAYLOAD,
    '07-openidea-corrupt-restore-preview.png'
  )
  await expect(corruptPreview.getByText('sha.png')).toBeVisible()
  await expect(corruptPreview.getByText('Corrupt', { exact: true })).toBeVisible()
  await corruptPreview.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(corruptPreview).toHaveCount(0, { timeout: 15_000 })
  const ok = path.join(worktreePath, 'src/ok.ts')
  await expect.poll(() => existsSync(ok), { timeout: 15_000 }).toBe(true)
  expect(readFileSync(ok, 'utf8')).toBe('ok')
  expect(existsSync(path.join(worktreePath, 'sha.png'))).toBe(false)
})
