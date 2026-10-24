import type { Page } from '@stablyai/playwright-test'

/**
 * Imports the folder-multi-repo fixture at `parentPath` as the MultiProduct group and creates its
 * folder workspace. Returns the folder workspace key.
 */
export async function importMultiProductFolder(
  page: Page,
  parentPath: string
): Promise<{ scanned: string[]; folderKey: string }> {
  return page.evaluate(async (parentPath) => {
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
    // Linked worktrees default to hidden; wait until WebApp's listing is authoritative with the hidden one.
    for (let i = 0; i < 40; i++) {
      const repos = s.getState().repos
      for (const repo of repos) {
        await s.getState().fetchWorktrees(repo.id)
      }
      const web = s.getState().repos.find((r) => r.displayName === 'WebApp')
      const detected = web ? s.getState().detectedWorktreesByRepo[web.id] : undefined
      if (
        repos.length >= 4 &&
        detected?.authoritative &&
        detected.worktrees.some((w) => !w.visible)
      ) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    const fw = await s
      .getState()
      .createFolderWorkspace(
        { projectGroupId: res.group.id, name: 'MultiProduct', folderPath: parentPath },
        { runtimeEnvironmentId: null }
      )
    return { scanned: scan.repos.map((r) => r.path), folderKey: `folder:${fw!.id}` }
  }, parentPath)
}
