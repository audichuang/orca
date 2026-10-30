import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/userData' } }))

import { getManagedScript as getClaudeManagedScript } from '../../src/main/claude/hook-service'
import { runVendorHook } from '../../src/main/agent-hooks/vendor-hook-delivery.test-fixture'

const wrapper = join(import.meta.dirname, 'fork-detached-agent.sh')
const paneIdentity = {
  ORCA_PANE_KEY: 'tab:leaf',
  ORCA_AGENT_PANE: 'tab:leaf',
  ORCA_AGENT_LAUNCH_TOKEN: 'launch',
  ORCA_AGENT_LAUNCH: 'launch'
}
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The installed hook, run the way a child agent launched through the wrapper would run it.
function throughWrapper(hookScript: string, detached: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'fork-detached-agent-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'hook.sh'), hookScript)
  const prefix = detached ? `/bin/sh "${wrapper}" ` : ''
  return `#!/bin/sh\nexec ${prefix}/bin/sh "${join(dir, 'hook.sh')}"\n`
}

describe('fork-detached-agent', () => {
  // Codex's hook reads the same pane identity; the shared fixture expects Claude's stdout.
  it('keeps a child agent from reporting as the pane it was launched from', async () => {
    const hook = getClaudeManagedScript('local')
    const inherited = await runVendorHook(throughWrapper(hook, false), paneIdentity)
    expect(inherited.requests).toHaveLength(1)

    for (const delivery of ['http', 'spool'] as const) {
      const detached = await runVendorHook(throughWrapper(hook, true), paneIdentity, delivery)
      expect(detached).toEqual({ requests: [], spooled: [] })
    }
  })
})
