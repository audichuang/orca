import { runProcess } from '@orca/process-host'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { applyExclusions } from './fork-lint-run.mjs'

const root = mkdtempSync(join(tmpdir(), 'fork-lint-run-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const STEPS = ['oxlint', 'check:a', 'check:skipped']
const EXCLUDED = { 'check:skipped': 'reason' }

describe('fork-lint-run', () => {
  it('drops excluded steps and keeps the rest in order', () => {
    expect(applyExclusions(STEPS, EXCLUDED)).toEqual(['oxlint', 'check:a'])
  })

  it('fails on an exclusion upstream lint no longer runs', () => {
    expect(() => applyExclusions(['oxlint', 'check:a'], EXCLUDED)).toThrow(
      'EXCLUDED names check:skipped, which upstream lint no longer runs'
    )
  })

  it('reports both failures and still executes a later package script', async () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        scripts: {
          'check:first': 'node check.mjs first',
          'check:second': 'node check.mjs second',
          'check:after': 'node check.mjs after'
        }
      })
    )
    writeFileSync(
      join(root, 'check.mjs'),
      `import { writeFileSync } from 'node:fs'
const name = process.argv[2]
if (name === 'after') {
  writeFileSync('after.txt', 'completed')
} else {
  console.error('diagnostic-' + name)
  process.exit(name === 'first' ? 3 : 4)
}
`
    )
    writeFileSync(
      join(root, 'runner.mjs'),
      `import { runLintSteps } from ${JSON.stringify(new URL('./fork-lint-run.mjs', import.meta.url).href)}
process.exitCode = await runLintSteps(
  ['check:first', 'check:second', 'check:after', 'check:path-literal-ratchet'],
  process.cwd()
)
`
    )
    const result = await runProcess({
      program: process.execPath,
      args: [join(root, 'runner.mjs')],
      cwd: root,
      timeoutMs: null
    })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('diagnostic-first')
    expect(result.stderr).toContain('diagnostic-second')
    expect(readFileSync(join(root, 'after.txt'), 'utf8')).toBe('completed')
  })
})
