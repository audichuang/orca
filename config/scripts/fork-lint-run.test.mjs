import { runProcess } from '@orca/process-host'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { applyExclusions, EXCLUSIVE_STEPS, runStepPool } from './fork-lint-run.mjs'

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

  it('never runs the two type-aware oxlint steps at once and keeps the other worker busy', async () => {
    const started = []
    const finish = {}
    const commands = [
      'audit:code-quality:type-aware',
      'check:code-quality:changed',
      'check:a',
      'check:b'
    ].map((name) => ({ name }))
    const flush = async () => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve()
      }
    }
    const pool = runStepPool(
      commands,
      2,
      ({ name }) => {
        started.push(name)
        return new Promise((resolve) => {
          finish[name] = () => resolve(name)
        })
      },
      ({ name }) => EXCLUSIVE_STEPS.has(name)
    )
    await flush()
    expect(started).toEqual(['audit:code-quality:type-aware', 'check:a'])
    finish['check:a']()
    await flush()
    expect(started).toEqual(['audit:code-quality:type-aware', 'check:a', 'check:b'])
    finish['check:b']()
    await flush()
    expect(started).toHaveLength(3)
    finish['audit:code-quality:type-aware']()
    await flush()
    expect(started.at(-1)).toBe('check:code-quality:changed')
    finish['check:code-quality:changed']()
    expect(await pool).toEqual(commands.map(({ name }) => name))
  })

  it('keeps the two type-aware package scripts apart while another step runs beside them', async () => {
    const dir = mkdtempSync(join(root, 'exclusive-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          'audit:code-quality:type-aware': 'node step.mjs type-aware',
          'check:code-quality:changed': 'node step.mjs changed',
          'check:release': 'node step.mjs release'
        }
      })
    )
    // Each exclusive step holds until it sees the other running (overlap) or the plain step ran.
    writeFileSync(
      join(dir, 'step.mjs'),
      `import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
const name = process.argv[2]
if (name === 'release') {
  writeFileSync('released', '')
} else {
  writeFileSync(name + '.running', '')
  for (;;) {
    if (readdirSync('.').some((file) => file.endsWith('.running') && file !== name + '.running')) {
      writeFileSync('overlap', name)
      break
    }
    if (existsSync('released')) break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  rmSync(name + '.running')
}
`
    )
    writeFileSync(
      join(dir, 'runner.mjs'),
      `import { runLintSteps } from ${JSON.stringify(new URL('./fork-lint-run.mjs', import.meta.url).href)}
process.exitCode = await runLintSteps(
  ['audit:code-quality:type-aware', 'check:code-quality:changed', 'check:release', 'check:path-literal-ratchet'],
  process.cwd()
)
`
    )
    const result = await runProcess({
      program: process.execPath,
      args: [join(dir, 'runner.mjs')],
      cwd: dir,
      timeoutMs: null
    })
    expect(result.code).toBe(0)
    expect(existsSync(join(dir, 'overlap'))).toBe(false)
    expect(existsSync(join(dir, 'released'))).toBe(true)
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
    expect(result.stderr).toContain('>> pnpm run check:first\n')
    expect(readFileSync(join(root, 'after.txt'), 'utf8')).toBe('completed')
  })
})
