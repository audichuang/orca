import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { forkCheckLintRecipe, lintParityErrors } from './fork-lint-parity.mjs'

const LINT = 'oxlint && pnpm run check:a && pnpm run check:skipped'
const EXCLUDED = { 'check:skipped': 'reason' }

function makefile(recipe, before = '') {
  return `${before}fork-check-lint: fork-base-guard\n${recipe
    .map((line) => `\t${line}`)
    .join('\n')}\n\nfork-check-next: fork-base-guard\n\tpnpm run check:b\n`
}

describe('fork-lint-parity', () => {
  it('passes when every upstream step runs or is excluded', () => {
    const errors = lintParityErrors({
      lintScript: LINT,
      makefile: makefile(['pnpm exec oxlint', 'pnpm run check:a']),
      excluded: EXCLUDED
    })
    expect(errors).toEqual([])
  })

  it('fails on a missing upstream step', () => {
    const errors = lintParityErrors({
      lintScript: LINT,
      makefile: makefile(['pnpm exec oxlint']),
      excluded: EXCLUDED
    })
    expect(errors).toEqual([expect.stringContaining('`pnpm run check:a`')])
  })

  it('fails on a stale exclusion', () => {
    const errors = lintParityErrors({
      lintScript: 'oxlint && pnpm run check:a',
      makefile: makefile(['oxlint', 'pnpm run check:a']),
      excluded: EXCLUDED
    })
    expect(errors).toEqual([expect.stringContaining('EXCLUDED names check:skipped')])
  })

  it('accepts @-prefixed lines and ignores recipe comments', () => {
    const recipe = forkCheckLintRecipe(
      makefile(['@pnpm exec oxlint', '# pnpm run check:a', '@ pnpm run check:a  '])
    )
    expect(recipe).toEqual(['pnpm exec oxlint', 'pnpm run check:a'])
  })

  it('reads the prerequisite line, not a target-specific variable line', () => {
    const errors = lintParityErrors({
      lintScript: LINT,
      makefile: makefile(
        ['pnpm exec oxlint', 'pnpm run check:a'],
        'fork-check-lint: export LC_ALL = C\n\tpnpm run check:decoy\n'
      ),
      excluded: EXCLUDED
    })
    expect(errors).toEqual([])
  })

  it('does not read the next target into the recipe', () => {
    expect(forkCheckLintRecipe(makefile(['oxlint']))).toEqual(['oxlint'])
  })

  it('fails clearly when the target is gone', () => {
    const errors = lintParityErrors({ lintScript: LINT, makefile: 'all:\n\techo\n' })
    expect(errors).toEqual([
      expect.stringContaining('no `fork-check-lint: fork-base-guard` recipe')
    ])
  })

  it('holds for this checkout', () => {
    const lintScript = JSON.parse(readFileSync('package.json', 'utf8')).scripts.lint
    expect(lintParityErrors({ lintScript, makefile: readFileSync('Makefile', 'utf8') })).toEqual([])
  })
})
