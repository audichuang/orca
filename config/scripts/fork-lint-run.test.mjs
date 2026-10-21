import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyExclusions, parseLintSteps, runLintSteps, pnpmArgs } from './fork-lint-run.mjs'

const LINT = 'oxlint && pnpm run check:a &&  pnpm run check:skipped'
const EXCLUDED = { 'check:skipped': 'reason' }

describe('fork-lint-run', () => {
  it('splits the lint script into trimmed steps', () => {
    expect(parseLintSteps(LINT)).toEqual(['oxlint', 'pnpm run check:a', 'pnpm run check:skipped'])
  })

  it('rejects a lint script whose commands a newline separates', () => {
    expect(() => parseLintSteps('pnpm run a\npnpm run b')).toThrow('spans several lines')
  })

  it('drops excluded steps and keeps the rest in order', () => {
    expect(applyExclusions(parseLintSteps(LINT), EXCLUDED)).toEqual(['oxlint', 'pnpm run check:a'])
  })

  it('fails on an exclusion upstream lint no longer runs', () => {
    expect(() => applyExclusions(['oxlint', 'pnpm run check:a'], EXCLUDED)).toThrow(
      'EXCLUDED names check:skipped, which upstream lint no longer runs'
    )
  })

  it('runs pnpm steps as-is and bare binaries through pnpm exec', () => {
    expect(pnpmArgs('pnpm run check:a')).toEqual(['run', 'check:a'])
    expect(pnpmArgs('oxlint')).toEqual(['exec', 'oxlint'])
  })

  it('rejects a step that needs a shell', () => {
    expect(() => pnpmArgs('pnpm run a | tee log')).toThrow('needs a shell')
  })

  it('stops at the first failing step and returns its exit code', () => {
    const ran = []
    const code = runLintSteps(['oxlint', 'pnpm run check:a', 'pnpm run check:b'], (args) => {
      ran.push(args.join(' '))
      return args.includes('check:a') ? 3 : 0
    })
    expect(code).toBe(3)
    expect(ran).toEqual(['exec oxlint', 'run check:a'])
  })

  it("applies this checkout's exclusions to its lint script", () => {
    const lintScript = JSON.parse(readFileSync('package.json', 'utf8')).scripts.lint
    const steps = applyExclusions(parseLintSteps(lintScript))
    expect(steps.length).toBeGreaterThan(0)
    expect(() => steps.map(pnpmArgs)).not.toThrow()
  })
})
