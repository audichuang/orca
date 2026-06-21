import { describe, expect, it } from 'vitest'

// Source-wiring guards for the runtime-environment refresh entry points.
// Behavioral coverage of the shared primitive lives in
// replay-then-refresh-runtime-environment.test.ts.

describe('runtime-environment refresh source wiring', () => {
  it('reposChanged client-event branch goes through the replay+refresh primitive', async () => {
    // Why (B2): reconnect must run replay → groups → repos → workspaces →
    // worktrees/lineage via the single shared primitive, not a bare
    // repos-first refresh.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const source = await fs.readFile(path.resolve(__dirname, '../../hooks/useIpcEvents.ts'), 'utf8')
    expect(source).toContain(
      'replayThenRefreshRuntimeEnvironment(useAppStore, environmentId, { background: true })'
    )
  })

  it('worktreesChanged uses env-scoped lineage, not the bare active-env fetch', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const source = await fs.readFile(path.resolve(__dirname, '../../hooks/useIpcEvents.ts'), 'utf8')
    expect(source).toContain(
      'fetchWorktrees(repoId, { skipLineageRefresh: true, background: true })'
    )
    expect(source).toContain(
      'refreshWorktreeLineageForRuntimeEnvironment(environmentId, { background: true })'
    )
  })
})
