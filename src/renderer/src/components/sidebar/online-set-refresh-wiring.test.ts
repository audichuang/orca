import { describe, expect, it } from 'vitest'

// Source-wiring guard (mirrors runtime-environment-project-refresh.test.ts): the
// sidebar must delegate the online-set refresh to the hook and must no longer
// fan out across all hosts or refresh the wrong host's lineage.
describe('sidebar online-set refresh wiring', () => {
  it('delegates to the ready-refresh hook', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const source = await fs.readFile(path.resolve(__dirname, 'index.tsx'), 'utf8')
    expect(source).toContain('useRuntimeEnvironmentReadyRefresh()')
  })

  it('no longer fans out to all hosts or uses the old online key', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const source = await fs.readFile(path.resolve(__dirname, 'index.tsx'), 'utf8')
    expect(source).not.toContain('void fetchAllWorktrees().then(() => fetchWorktreeLineage())')
    expect(source).not.toContain('onlineRuntimeEnvKey')
  })
})
