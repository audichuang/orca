import { expect, type Page } from '@stablyai/playwright-test'

/**
 * Imports the folder-multi-repo fixture at `parentPath` as the MultiProduct group and creates its
 * folder workspace. Returns the folder workspace key.
 */
export async function importMultiProductFolder(
  page: Page,
  parentPath: string
): Promise<{ scanned: string[]; folderKey: string }> {
  const { scanned, groupId } = await page.evaluate(async (parentPath) => {
    const s = window.__store!
    const scan = await s
      .getState()
      .scanNestedRepos(parentPath, undefined, { runtimeEnvironmentId: null })
    if (!scan) {
      throw new Error('scan failed')
    }
    const res = await s.getState().importNestedRepos({
      parentPath,
      groupName: 'MultiProduct',
      projectPaths: scan.repos.map((r) => r.path),
      runtimeEnvironmentId: null,
      mode: 'group'
    })
    if (!res?.group) {
      throw new Error(`import failed ${JSON.stringify(res)}`)
    }
    return { scanned: scan.repos.map((r) => r.path), groupId: res.group.id }
  }, parentPath)
  // Linked worktrees default to hidden; wait until WebApp's listing is authoritative with the hidden one.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const s = window.__store!
          const repos = s.getState().repos
          for (const repo of repos) {
            await s.getState().fetchWorktrees(repo.id)
          }
          const web = s.getState().repos.find((r) => r.displayName === 'WebApp')
          const detected = web ? s.getState().detectedWorktreesByRepo[web.id] : undefined
          return (
            repos.length >= 4 &&
            Boolean(detected?.authoritative) &&
            detected!.worktrees.some((w) => !w.visible)
          )
        }),
      { timeout: 12_000, intervals: [300] }
    )
    .toBe(true)
  const folderKey = await page.evaluate(
    async ({ groupId, parentPath }) => {
      const fw = await window
        .__store!.getState()
        .createFolderWorkspace(
          { projectGroupId: groupId, name: 'MultiProduct', folderPath: parentPath },
          { runtimeEnvironmentId: null }
        )
      return `folder:${fw!.id}`
    },
    { groupId, parentPath }
  )
  return { scanned, folderKey }
}
