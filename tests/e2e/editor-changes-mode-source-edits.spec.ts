import { expect, test } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

const EDIT_MARKER = 'typed-in-source-mode'

test('Changes mode shows edits typed in Source mode after switching back', async ({ orcaPage }) => {
  await waitForSessionReady(orcaPage)
  const worktreeId = await waitForActiveWorktree(orcaPage)
  const fileId = await orcaPage.evaluate(async (wId) => {
    const state = window.__store!.getState()
    const worktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((entry) => entry.id === wId)!
    const separator = worktree.path.includes('\\') ? '\\' : '/'
    const relativePath = 'changes-mode-source-edits.ts'
    const filePath = `${worktree.path}${separator}${relativePath}`
    await window.api.fs.writeFile({ filePath, content: 'export const a = 1\n' })
    const id = state.openFile({
      filePath,
      relativePath,
      worktreeId: wId,
      language: 'typescript',
      mode: 'edit'
    })
    state.setEditorViewMode(id, 'changes')
    return id
  }, worktreeId)

  const diffEditor = orcaPage.locator('.monaco-diff-editor >> visible=true').first()
  await expect(diffEditor).toContainText('export const a = 1', { timeout: 20_000 })

  await orcaPage.evaluate((id) => window.__store!.getState().setEditorViewMode(id, 'edit'), fileId)
  const sourceLines = orcaPage
    .locator('.monaco-editor:not(.monaco-diff-editor *) .view-lines >> visible=true')
    .first()
  await expect(sourceLines).toContainText('export const a = 1', { timeout: 20_000 })
  await sourceLines.click()
  await orcaPage.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End')
  await orcaPage.keyboard.type(`// ${EDIT_MARKER}`)
  await expect(sourceLines).toContainText(EDIT_MARKER)

  await orcaPage.evaluate(
    (id) => window.__store!.getState().setEditorViewMode(id, 'changes'),
    fileId
  )
  await expect(diffEditor).toContainText(EDIT_MARKER, { timeout: 10_000 })
})
