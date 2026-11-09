import { expect } from './orca-app'
import { runBinaryAndKeyboardScenarios } from './folder-multi-repo-binary-and-keyboard-scenarios'
import {
  clearSourceControlSelections,
  type ExtraScenarioContext
} from './folder-multi-repo-scenario-context'

// S15: open to the side; then S17 and S19.
export async function runLayoutScenarios(ctx: ExtraScenarioContext): Promise<void> {
  const {
    page,
    folderKey,
    H,
    scenario,
    shot,
    entry,
    expandOnly,
    getOpenFiles,
    activeWt,
    wtIdByPath,
    R
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
    // Upstream #38831: the repo owns the tab, the folder's split group holds it.
    expect(file?.worktreeId).toBe(await wtIdByPath(R.webapp))
    expect(after.tabs.some((t) => t.entityId === file?.id && t.groupId === newGroup)).toBe(true)
    expect(await activeWt()).toBe(folderKey)
    await expect(page.locator('.monaco-diff-editor').first()).toBeVisible({ timeout: 20_000 })
    await shot('S15b-split-opened')
    // The right-clicked row stays selected after the menu action; start the multi-select from none.
    await clearSourceControlSelections(page)
    // Ctrl/Cmd-click must still only multi-select, never create another split.
    const groupCount = after.ids.length
    await entry('unstaged', 'src/partial.ts').click({ modifiers: ['ControlOrMeta'] })
    await entry('unstaged', 'README.md').click({ modifiers: ['ControlOrMeta'] })
    await expect(page.getByText(/^2 selected$/)).toBeVisible({ timeout: 10_000 })
    expect((await groups()).ids.length).toBe(groupCount)
    ev.push('ctrl-click: 2 selected, group count unchanged')
    await shot('S15c-ctrl-click-multiselect')
    await clearSourceControlSelections(page)
  })

  await runBinaryAndKeyboardScenarios(ctx)
}
