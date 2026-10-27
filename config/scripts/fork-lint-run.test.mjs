import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyExclusions, lintStepArgs, pnpmArgs, runLintSteps } from './fork-lint-run.mjs'
import { LINT_STEPS, resolveLintCommands } from './run-lint.mjs'

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

  it('runs package scripts by name and bare commands through pnpm exec', () => {
    const scripts = { 'check:a': 'node a.mjs && node b.mjs' }
    expect(lintStepArgs({ name: 'check:a', command: scripts['check:a'] }, scripts)).toEqual([
      'run',
      'check:a'
    ])
    expect(lintStepArgs({ name: 'oxlint', command: 'oxlint' }, scripts)).toEqual(['exec', 'oxlint'])
  })

  it('rejects a bare command that needs a shell', () => {
    expect(() => pnpmArgs('oxlint | tee log')).toThrow('needs a shell')
  })

  it('runs every step and returns the first failing exit code', () => {
    const ran = []
    const steps = ['oxlint', 'check:a', 'check:b'].map((name) => ({ name, args: ['run', name] }))
    const code = runLintSteps(steps, (args) => {
      ran.push(args.join(' '))
      return args.includes('check:a') ? 3 : args.includes('check:b') ? 4 : 0
    })
    expect(code).toBe(3)
    expect(ran).toEqual(['run oxlint', 'run check:a', 'run check:b'])
  })

  it("applies this checkout's exclusions to upstream's lint steps", () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'))
    const steps = resolveLintCommands(scripts, applyExclusions(LINT_STEPS))
    expect(steps.length).toBeGreaterThan(0)
    expect(() => steps.map((step) => lintStepArgs(step, scripts))).not.toThrow()
  })
})
